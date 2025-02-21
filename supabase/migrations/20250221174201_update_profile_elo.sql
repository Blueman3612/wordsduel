CREATE OR REPLACE FUNCTION update_profile_elo(p_user_id UUID, p_new_elo INT, p_games_played INT)
RETURNS SETOF profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE profiles
    SET 
        elo = p_new_elo,
        games_played = p_games_played,
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING *;
END;
$$;
