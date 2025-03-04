-- Drop all existing policies on the lobbies table
DROP POLICY IF EXISTS "Allow read access to lobbies" ON lobbies;
DROP POLICY IF EXISTS "Allow insert access to lobbies" ON lobbies;
DROP POLICY IF EXISTS "Allow update access to lobbies" ON lobbies;
DROP POLICY IF EXISTS "Allow delete access to lobbies" ON lobbies;
DROP POLICY IF EXISTS "Allow public read access to lobbies" ON lobbies;
DROP POLICY IF EXISTS "Allow host to manage lobby" ON lobbies;
DROP POLICY IF EXISTS "Allow members to view lobby" ON lobbies;

-- Enable RLS on lobbies table if not already enabled
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

-- Create simplified policies
-- Anyone can read waiting lobbies
CREATE POLICY "Allow public read access to waiting lobbies" ON lobbies
  FOR SELECT TO public
  USING (status = 'waiting');

-- Anyone can read lobbies they are a member of or host
CREATE POLICY "Allow members and host to read lobby" ON lobbies
  FOR SELECT TO public
  USING (
    auth.uid() IN (
      SELECT user_id FROM lobby_members WHERE lobby_id = id
      UNION
      SELECT host_id
    )
  );

-- Anyone can create a lobby
CREATE POLICY "Allow users to create lobbies" ON lobbies
  FOR INSERT TO public
  WITH CHECK (auth.uid() = host_id);

-- Only the host can update their lobby
CREATE POLICY "Allow host to update lobby" ON lobbies
  FOR UPDATE TO public
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- Only the host can delete their lobby
CREATE POLICY "Allow host to delete lobby" ON lobbies
  FOR DELETE TO public
  USING (auth.uid() = host_id); 