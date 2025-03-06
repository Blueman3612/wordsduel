-- Create a table to track presence for each lobby
CREATE TABLE IF NOT EXISTS lobby_presence (
  lobby_id UUID REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (lobby_id, user_id)
);

-- Function to update or insert presence
CREATE OR REPLACE FUNCTION update_lobby_presence(
  p_lobby_id UUID,
  p_user_id UUID
) RETURNS void AS $$
BEGIN
  INSERT INTO lobby_presence (lobby_id, user_id, last_seen)
  VALUES (p_lobby_id, p_user_id, NOW())
  ON CONFLICT (lobby_id, user_id) 
  DO UPDATE SET last_seen = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove presence
CREATE OR REPLACE FUNCTION remove_lobby_presence(
  p_lobby_id UUID,
  p_user_id UUID
) RETURNS void AS $$
BEGIN
  DELETE FROM lobby_presence 
  WHERE lobby_id = p_lobby_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up empty lobbies
CREATE OR REPLACE FUNCTION cleanup_empty_lobby(
  p_lobby_id UUID
) RETURNS void AS $$
DECLARE
  v_presence_count INT;
BEGIN
  RAISE LOG 'cleanup_empty_lobby called for lobby %', p_lobby_id;
  
  -- Get count of present users
  SELECT COUNT(*) INTO v_presence_count
  FROM lobby_presence
  WHERE lobby_id = p_lobby_id;

  RAISE LOG 'Found % presence records for lobby %', v_presence_count, p_lobby_id;

  -- If no users are present, delete the lobby
  IF v_presence_count = 0 THEN
    RAISE LOG 'No presence records found, deleting lobby %', p_lobby_id;
    DELETE FROM lobbies WHERE id = p_lobby_id;
    RAISE LOG 'Lobby % deleted', p_lobby_id;
  ELSE
    RAISE LOG 'Not deleting lobby % because % players are still present', p_lobby_id, v_presence_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to clean up lobby when all players leave
CREATE OR REPLACE FUNCTION trigger_cleanup_empty_lobby()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining_count INT;
BEGIN
  RAISE LOG 'trigger_cleanup_empty_lobby called for lobby %', OLD.lobby_id;
  
  -- Check if this was the last presence record
  SELECT COUNT(*) INTO v_remaining_count
  FROM lobby_presence
  WHERE lobby_id = OLD.lobby_id;

  -- If this was the last record (it's already been deleted, so count should be 0)
  IF v_remaining_count = 0 THEN
    RAISE LOG 'Last presence record deleted, calling cleanup for lobby %', OLD.lobby_id;
    PERFORM cleanup_empty_lobby(OLD.lobby_id);
  ELSE
    RAISE LOG 'Still % presence records remaining for lobby %', v_remaining_count, OLD.lobby_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS cleanup_empty_lobby_trigger ON lobby_presence;
CREATE TRIGGER cleanup_empty_lobby_trigger
AFTER DELETE ON lobby_presence
FOR EACH ROW
EXECUTE FUNCTION trigger_cleanup_empty_lobby();

-- Verify and enable the trigger
ALTER TABLE lobby_presence ENABLE TRIGGER cleanup_empty_lobby_trigger;

-- Add RLS policies
ALTER TABLE lobby_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own presence"
ON lobby_presence
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Verify trigger exists and is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'cleanup_empty_lobby_trigger'
    AND tgenabled = 'O'  -- 'O' means enabled
  ) THEN
    RAISE EXCEPTION 'Trigger cleanup_empty_lobby_trigger was not created properly or is not enabled';
  END IF;
END;
$$; 