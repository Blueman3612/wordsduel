CREATE OR REPLACE FUNCTION handle_game_end(
  p_lobby_id UUID,
  p_game_status TEXT,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winner_id UUID;
  v_loser_id UUID;
  v_winner_elo INT;
  v_loser_elo INT;
  v_winner_games INT;
  v_loser_games INT;
  v_elo_change INT;
  v_winner_k_factor INT;
  v_loser_k_factor INT;
  v_game_state RECORD;
  v_lobby RECORD;
BEGIN
  -- Get the game state
  SELECT * INTO v_game_state 
  FROM game_state 
  WHERE lobby_id = p_lobby_id;

  -- Get the lobby to determine players
  SELECT * INTO v_lobby 
  FROM lobby_members 
  WHERE lobby_id = p_lobby_id 
  ORDER BY joined_at ASC 
  LIMIT 2;

  -- Determine winner/loser based on game state
  IF p_reason = 'time' THEN
    IF v_game_state.player1_time <= 0 THEN
      v_winner_id := v_lobby.user_id[2];
      v_loser_id := v_lobby.user_id[1];
    ELSE
      v_winner_id := v_lobby.user_id[1];
      v_loser_id := v_lobby.user_id[2];
    END IF;
  ELSIF p_reason = 'forfeit' THEN
    -- Handle forfeit logic here
    -- The player who forfeited is the loser
    -- We'll need to pass this information in later
    NULL;
  END IF;

  -- Get current ELO and games played
  SELECT elo, games_played INTO v_winner_elo, v_winner_games
  FROM profiles
  WHERE id = v_winner_id;

  SELECT elo, games_played INTO v_loser_elo, v_loser_games
  FROM profiles
  WHERE id = v_loser_id;

  -- Calculate K-factors
  v_winner_k_factor := 
    CASE 
      WHEN v_winner_games < 10 THEN 64
      WHEN v_winner_games < 25 THEN 32
      WHEN v_winner_games < 100 THEN 24
      ELSE 16
    END;

  v_loser_k_factor := 
    CASE 
      WHEN v_loser_games < 10 THEN 64
      WHEN v_loser_games < 25 THEN 32
      WHEN v_loser_games < 100 THEN 24
      ELSE 16
    END;

  -- Calculate ELO change
  v_elo_change := ROUND(
    ((v_winner_k_factor + v_loser_k_factor) / 2.0) * 
    (1 - 1 / (1 + POWER(10::float, (v_loser_elo - v_winner_elo)::float / 400)))
  );

  -- Update profiles atomically
  UPDATE profiles
  SET 
    elo = 
      CASE 
        WHEN id = v_winner_id THEN elo + v_elo_change
        WHEN id = v_loser_id THEN elo - v_elo_change
      END,
    games_played = games_played + 1
  WHERE id IN (v_winner_id, v_loser_id);

  -- Update game state to mark ELO as updated
  UPDATE game_state
  SET 
    status = p_game_status,
    elo_updated = true,
    updated_at = NOW()
  WHERE lobby_id = p_lobby_id;

END;
$$; 