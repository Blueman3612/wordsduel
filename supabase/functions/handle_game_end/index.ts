// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
};

interface RequestBody {
  lobby_id: string
  game_status: string
  reason: 'time' | 'forfeit'
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Request method:', req.method)
    console.log('Request headers:', Object.fromEntries(req.headers.entries()))
    
    // Get the JWT token from the Authorization header
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header received:', authHeader?.substring(0, 20) + '...')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Extract the token without the 'Bearer ' prefix
    const token = authHeader.replace('Bearer ', '')
    console.log('Supabase URL:', Deno.env.get('SUPABASE_URL'))
    console.log('Using token (first 20 chars):', token.substring(0, 20) + '...')
    
    // Create Supabase client with auth header
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    )

    // Parse request body
    const { lobby_id, game_status, reason } = await req.json() as RequestBody
    console.log('Processing game end for lobby:', lobby_id)

    // Get game state and check if it exists
    const { data: gameState, error: gameStateError } = await supabaseClient
      .from('game_state')
      .select('*')
      .eq('lobby_id', lobby_id)
      .single()

    console.log('Game state query result:', { 
      hasData: !!gameState, 
      error: gameStateError?.message,
      lobbyId: lobby_id 
    })

    if (gameStateError || !gameState) {
      throw new Error(`Failed to fetch game state: ${gameStateError?.message || 'No game state found'}`)
    }

    // Get lobby members in join order
    const { data: lobbyMembers, error: lobbyError } = await supabaseClient
      .from('lobby_members')
      .select('user_id')
      .eq('lobby_id', lobby_id)
      .order('joined_at', { ascending: true })
      .limit(2)

    if (lobbyError || !lobbyMembers || lobbyMembers.length !== 2) {
      throw new Error(`Failed to fetch lobby members: ${lobbyError?.message}`)
    }

    // Determine winner/loser based on time
    const winnerId = gameState.player1_time <= 0 
      ? lobbyMembers[1].user_id 
      : lobbyMembers[0].user_id
    const loserId = gameState.player1_time <= 0 
      ? lobbyMembers[0].user_id 
      : lobbyMembers[1].user_id

    console.log('Determined winner/loser:', { winnerId, loserId })

    // Get current ELO ratings
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('id, elo, games_played')
      .in('id', [winnerId, loserId])

    if (profilesError || !profiles || profiles.length !== 2) {
      throw new Error(`Failed to fetch profiles: ${profilesError?.message}`)
    }

    const winner = profiles.find(p => p.id === winnerId)!
    const loser = profiles.find(p => p.id === loserId)!

    console.log('Current ratings:', {
      winner: { id: winner.id, elo: winner.elo, games: winner.games_played },
      loser: { id: loser.id, elo: loser.elo, games: loser.games_played }
    })

    // Calculate K-factors based on games played
    const winnerKFactor = winner.games_played < 10 ? 64 
      : winner.games_played < 25 ? 32 
      : winner.games_played < 100 ? 24 
      : 16

    const loserKFactor = loser.games_played < 10 ? 64 
      : loser.games_played < 25 ? 32 
      : loser.games_played < 100 ? 24 
      : 16

    // Calculate ELO change
    const averageK = (winnerKFactor + loserKFactor) / 2
    const eloChange = Math.round(
      averageK * (1 - 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400)))
    )

    console.log('Calculated ELO changes:', {
      winnerKFactor,
      loserKFactor,
      averageK,
      eloChange,
      winnerNewElo: winner.elo + eloChange,
      loserNewElo: loser.elo - eloChange
    })

    // Update winner's profile
    const { error: winnerUpdateError } = await supabaseClient
      .from('profiles')
      .update({
        elo: winner.elo + eloChange,
        games_played: winner.games_played + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', winner.id)

    if (winnerUpdateError) {
      throw new Error(`Failed to update winner profile: ${winnerUpdateError.message}`)
    }

    // Update loser's profile
    const { error: loserUpdateError } = await supabaseClient
      .from('profiles')
      .update({
        elo: loser.elo - eloChange,
        games_played: loser.games_played + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', loser.id)

    if (loserUpdateError) {
      throw new Error(`Failed to update loser profile: ${loserUpdateError.message}`)
    }

    // Update game state to mark ELO as updated
    const { error: gameUpdateError } = await supabaseClient
      .from('game_state')
      .update({
        status: game_status,
        elo_updated: true,
        updated_at: new Date().toISOString()
      })
      .eq('lobby_id', lobby_id)

    if (gameUpdateError) {
      throw new Error(`Failed to update game state: ${gameUpdateError.message}`)
    }

    console.log('Successfully updated all records')

    return new Response(
      JSON.stringify({
        success: true,
        winner: {
          id: winnerId,
          oldElo: winner.elo,
          newElo: winner.elo + eloChange
        },
        loser: {
          id: loserId,
          oldElo: loser.elo,
          newElo: loser.elo - eloChange
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in handle_game_end:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
}); 