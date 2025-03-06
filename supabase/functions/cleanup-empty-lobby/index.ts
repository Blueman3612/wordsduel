// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Hello from Functions!")

serve(async (req) => {
  try {
    // Create a Supabase client with the service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the presence event data
    const body = await req.text()
    if (!body) {
      return new Response(
        JSON.stringify({ error: 'No request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let data
    try {
      data = JSON.parse(body)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { channel, presenceState } = data
    if (!channel || !presenceState) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Extract lobby ID from channel name (format: game:lobbyId)
    const lobbyId = channel.split(':')[1]
    if (!lobbyId) {
      return new Response(
        JSON.stringify({ error: 'Invalid channel format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if there are any online players in the presence state
    const onlinePlayers = Object.keys(presenceState).length
    console.log(`Lobby ${lobbyId} has ${onlinePlayers} online players`)

    if (onlinePlayers === 0) {
      // First check if the game is finished
      const { data: gameState } = await supabaseClient
        .from('game_state')
        .select('status')
        .eq('lobby_id', lobbyId)
        .maybeSingle()

      // Only proceed with cleanup if game is finished or no game state exists
      if (!gameState || gameState.status === 'finished') {
        console.log(`Cleaning up finished lobby ${lobbyId}...`)
        
        // Delete the lobby (cascade will handle members)
        const { error: deleteError } = await supabaseClient
          .from('lobbies')
          .delete()
          .eq('id', lobbyId)

        if (deleteError) {
          throw deleteError
        }

        console.log(`Lobby ${lobbyId} deleted successfully`)
        return new Response(
          JSON.stringify({ message: 'Lobby deleted successfully' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Lobby not ready for cleanup',
        onlinePlayers
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in cleanup-empty-lobby:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/cleanup-empty-lobby' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
