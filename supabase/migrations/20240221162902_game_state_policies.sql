-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow insert access to game state for lobby members" ON game_state;
DROP POLICY IF EXISTS "Allow read access to game state for lobby members" ON game_state;
DROP POLICY IF EXISTS "Allow update access to game state for lobby members" ON game_state;

-- Create more inclusive policies that check both lobby membership and the user's role in the game
CREATE POLICY "Allow insert access to game state for players" ON game_state
  FOR INSERT TO public
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM lobby_members WHERE lobby_id = game_state.lobby_id
      UNION
      SELECT host_id FROM lobbies WHERE id = game_state.lobby_id
    )
  );

CREATE POLICY "Allow read access to game state for players" ON game_state
  FOR SELECT TO public
  USING (
    auth.uid() IN (
      SELECT user_id FROM lobby_members WHERE lobby_id = game_state.lobby_id
      UNION
      SELECT host_id FROM lobbies WHERE id = game_state.lobby_id
    )
  );

CREATE POLICY "Allow update access to game state for players" ON game_state
  FOR UPDATE TO public
  USING (
    auth.uid() IN (
      SELECT user_id FROM lobby_members WHERE lobby_id = game_state.lobby_id
      UNION
      SELECT host_id FROM lobbies WHERE id = game_state.lobby_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM lobby_members WHERE lobby_id = game_state.lobby_id
      UNION
      SELECT host_id FROM lobbies WHERE id = game_state.lobby_id
    )
  ); 