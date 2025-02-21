// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
};

interface RequestBody {
  lobby_id: string
  game_status: string
  reason: 'time' | 'forfeit'
}

Deno.serve(async (req) => {
  // Always include CORS headers
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  }

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    // Get the JWT token from the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { headers, status: 401 }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    )

    // Get request body
    const { lobby_id, game_status, reason } = await req.json() as RequestBody

    // Check if ELO has already been updated
    const { data: currentState, error: stateCheckError } = await supabaseClient
      .from('game_state')
      .select('status, elo_updated')
      .eq('lobby_id', lobby_id)
      .single()

    if (stateCheckError) {
      return new Response(
        JSON.stringify({ error: 'Failed to check game state' }),
        { headers, status: 400 }
      )
    }

    // If ELO has already been updated, return early
    if (currentState.elo_updated || currentState.status === 'finished') {
      return new Response(
        JSON.stringify({ message: 'Game already finished and ELO updated' }),
        { headers, status: 200 }
      )
    }

    // Get game state
    const { data: gameState, error: gameStateError } = await supabaseClient
      .from('game_state')
      .select('*')
      .eq('lobby_id', lobby_id)
      .single()

    if (gameStateError || !gameState) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch game state' }),
        { headers, status: 400 }
      )
    }

    // Get lobby members
    const { data: lobbyMembers, error: lobbyError } = await supabaseClient
      .from('lobby_members')
      .select('user_id')
      .eq('lobby_id', lobby_id)
      .order('joined_at', { ascending: true })
      .limit(2)

    if (lobbyError || !lobbyMembers || lobbyMembers.length !== 2) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch lobby members' }),
        { headers, status: 400 }
      )
    }

    // Determine winner/loser
    const winnerId = gameState.player1_time <= 0 
      ? lobbyMembers[1].user_id 
      : lobbyMembers[0].user_id
    const loserId = gameState.player1_time <= 0 
      ? lobbyMembers[0].user_id 
      : lobbyMembers[1].user_id

    // Get current ELO and games played
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('id, elo, games_played')
      .in('id', [winnerId, loserId])

    if (profilesError || !profiles || profiles.length !== 2) {
      console.error('[ELO Update] Failed to fetch profiles:', {
        error: profilesError,
        profiles,
        winnerId,
        loserId
      });
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles', details: { profilesError, profiles, winnerId, loserId } }),
        { headers, status: 400 }
      )
    }

    console.log('[ELO Update] Fetched initial profiles:', {
      profiles,
      winnerId,
      loserId
    });

    const winner = profiles.find(p => p.id === winnerId)!
    const loser = profiles.find(p => p.id === loserId)!

    console.log('[ELO Update] Found winner and loser:', {
      winner: { id: winner.id, elo: winner.elo, games: winner.games_played },
      loser: { id: loser.id, elo: loser.elo, games: loser.games_played }
    });

    // Calculate K-factors
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

    console.log('[ELO Update] Calculated ELO changes:', {
      winnerKFactor,
      loserKFactor,
      averageK,
      eloChange,
      winnerNewElo: winner.elo + eloChange,
      loserNewElo: loser.elo - eloChange
    });

    // Update winner's profile
    console.log('Updating winner profile:', {
      userId: winner.id,
      newElo: winner.elo + eloChange,
      gamesPlayed: winner.games_played + 1
    });
    const { data: winnerUpdateData, error: winnerUpdateError } = await supabaseClient.rpc(
      'update_profile_elo',
      {
        p_user_id: winner.id,
        p_new_elo: winner.elo + eloChange,
        p_games_played: winner.games_played + 1
      }
    );
    
    if (winnerUpdateError) {
      console.error('Error updating winner profile:', winnerUpdateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update winner profile' }),
        { status: 500, headers }
      );
    }
    
    console.log('Winner profile updated:', winnerUpdateData);

    // Update loser's profile
    console.log('Updating loser profile:', {
      userId: loser.id,
      newElo: loser.elo - eloChange,
      gamesPlayed: loser.games_played + 1
    });
    const { data: loserUpdateData, error: loserUpdateError } = await supabaseClient.rpc(
      'update_profile_elo',
      {
        p_user_id: loser.id,
        p_new_elo: loser.elo - eloChange,
        p_games_played: loser.games_played + 1
      }
    );

    if (loserUpdateError) {
      console.error('Error updating loser profile:', loserUpdateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update loser profile' }),
        { status: 500, headers }
      );
    }

    console.log('Loser profile updated:', loserUpdateData);

    // Verify the updates
    const { data: verifyProfiles, error: verifyError } = await supabaseClient
      .from('profiles')
      .select('id, elo')
      .in('id', [winnerId, loserId])

    console.log('[ELO Update] Verification check:', {
      profiles: verifyProfiles,
      error: verifyError
    });

    // Update game state
    const gameUpdate = await supabaseClient
      .from('game_state')
      .update({
        status: game_status,
        elo_updated: true,
        updated_at: new Date().toISOString()
      })
      .eq('lobby_id', lobby_id)
      .select()

    console.log('[ELO Update] Game state update result:', {
      error: gameUpdate.error,
      data: gameUpdate.data,
      status: gameUpdate.status
    });

    if (gameUpdate.error) {
      console.error('[ELO Update] Failed to update game state:', gameUpdate.error);
      return new Response(
        JSON.stringify({ error: 'Failed to update game state', details: gameUpdate.error }),
        { headers, status: 400 }
      )
    }

    console.log('[ELO Update] Successfully completed all updates');

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
      { headers, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers, status: 500 }
    )
  }
}); 