-- Drop existing delete policies
DROP POLICY IF EXISTS "Allow host to delete lobby" ON lobbies;
DROP POLICY IF EXISTS "Host can delete their lobby" ON lobbies;
DROP POLICY IF EXISTS "Only host can delete their lobby" ON lobbies;

-- Create new delete policy that allows deletion when:
-- 1. The user is the host, OR
-- 2. All players have left (no members in lobby_members)
CREATE POLICY "Allow lobby deletion when empty or by host" ON lobbies
  FOR DELETE TO authenticated
  USING (
    auth.uid() = host_id OR
    NOT EXISTS (
      SELECT 1 FROM lobby_members 
      WHERE lobby_id = id
    )
  );
