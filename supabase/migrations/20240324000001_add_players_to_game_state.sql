-- Add players column to game_state table
ALTER TABLE game_state 
ADD COLUMN IF NOT EXISTS players JSONB;

-- Add comment for documentation
COMMENT ON COLUMN game_state.players IS 'Array of player objects containing id, name, avatar_url, elo, score, and games_played';

-- Update RLS policies to allow access to players column
ALTER POLICY "Allow read access to game state for players" ON game_state
  FOR SELECT TO public
  USING (
    auth.uid() IN (
      SELECT user_id FROM lobby_members WHERE lobby_id = game_state.lobby_id
      UNION
      SELECT host_id FROM lobbies WHERE id = game_state.lobby_id
    )
  ); 