'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ActionModal } from '@/components/game/ActionModal'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { PageTransition } from '@/components/layout/PageTransition'
import { Plus, Users, Clock, Lock, LogOut } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { format } from 'timeago.js'

interface Lobby {
  id: string
  name: string
  host_id: string
  created_at: string
  status: 'waiting' | 'in_progress' | 'completed'
  max_players: number
  game_config: any
  password: string | null
  host: {
    display_name: string
  }
  _count: {
    members: number
  }
  is_member?: boolean
  password_required?: boolean
}

interface RawLobbyResponse {
  id: string
  name: string
  host_id: string
  created_at: string
  status: 'waiting' | 'in_progress' | 'completed'
  max_players: number
  game_config: any
  host: {
    email: string
  } | null
  lobby_members: number
}

interface LobbyMember {
  user_id: string
}

export default function LobbiesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newLobbyName, setNewLobbyName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [lobbyPassword, setLobbyPassword] = useState('')
  const [joiningLobby, setJoiningLobby] = useState<Lobby | null>(null)
  const [joinPassword, setJoinPassword] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  // Fetch initial lobbies and set up real-time subscription
  useEffect(() => {
    if (!user) return // Don't fetch if there's no user

    fetchLobbies()
    
    // Subscribe to lobby changes
    const lobbySubscription = supabase
      .channel('lobby-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies'
        },
        () => {
          fetchLobbies()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobby_members'
        },
        () => {
          fetchLobbies()
        }
      )
      .subscribe()

    // Refresh lobbies periodically to ensure data consistency
    const refreshInterval = setInterval(fetchLobbies, 1000)

    return () => {
      supabase.removeChannel(lobbySubscription)
      clearInterval(refreshInterval)
    }
  }, [user]) // Add user to dependencies

  const fetchLobbies = async () => {
    if (!user) return // Don't fetch if there's no user
    
    try {
      // First check if user already has a lobby
      const { data: existingLobby } = await supabase
        .from('lobbies')
        .select('id')
        .eq('host_id', user.id)
        .eq('status', 'waiting')
        .single()

      if (existingLobby) {
        // User already has a lobby, don't show create button
        setShowCreateModal(false)
      }

      // Get all lobbies
      const { data: lobbiesData, error: lobbiesError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })

      if (lobbiesError) {
        console.error('Error fetching lobbies:', lobbiesError)
        return
      }

      // Get all member data in a single query
      const { data: allMemberships } = await supabase
        .from('lobby_members')
        .select('lobby_id, user_id')

      // Get all host display names in a single query
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, display_name')

      // Create lookup maps for faster access
      const membershipMap = new Map()
      allMemberships?.forEach(membership => {
        const existing = membershipMap.get(membership.lobby_id) || []
        existing.push(membership.user_id)
        membershipMap.set(membership.lobby_id, existing)
      })

      const profileMap = new Map(
        allProfiles?.map(profile => [profile.id, profile.display_name]) || []
      )

      // Process lobbies using the lookup maps
      const processedLobbies = lobbiesData?.map(lobby => {
        const members = membershipMap.get(lobby.id) || []
        return {
          ...lobby,
          host: {
            display_name: profileMap.get(lobby.host_id) || 'Unknown'
          },
          _count: {
            members: members.length
          },
          is_member: members.includes(user.id)
        }
      }) || []

      setLobbies(processedLobbies)
    } catch (error) {
      console.error('Error fetching lobbies:', error)
      setLobbies([])
    }
  }

  const createLobby = async () => {
    if (!user || !newLobbyName.trim()) return

    try {
      setIsCreating(true)

      // Check if user already has a lobby
      const { data: existingLobby } = await supabase
        .from('lobbies')
        .select('id')
        .eq('host_id', user.id)
        .eq('status', 'waiting')
        .single()

      if (existingLobby) {
        showToast('You already have an active lobby', 'error')
        return
      }

      const { data: lobby, error: createError } = await supabase
        .from('lobbies')
        .insert({
          name: newLobbyName.trim(),
          host_id: user.id,
          max_players: 2,
          password: lobbyPassword.trim() || null
        })
        .select()
        .single()

      if (createError) throw createError

      // Join the lobby as host
      const { error: joinError } = await supabase
        .from('lobby_members')
        .insert({
          lobby_id: lobby.id,
          user_id: user.id
        })

      if (joinError) throw joinError

      setShowCreateModal(false)
      resetCreateForm()
      showToast('Lobby created successfully!', 'success')
      fetchLobbies()
    } catch (error) {
      console.error('Error creating lobby:', error)
      showToast('Failed to create lobby', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const resetCreateForm = () => {
    setNewLobbyName('')
    setLobbyPassword('')
  }

  const joinLobby = async (lobby: Lobby) => {
    if (!user) {
      showToast('Please sign in to join a lobby', 'error')
      return
    }

    if (lobby.password) {
      setJoiningLobby(lobby)
      setJoinPassword('')
      return
    }

    try {
      setIsJoining(true)
      const { error } = await supabase
        .from('lobby_members')
        .insert({
          lobby_id: lobby.id,
          user_id: user.id
        })

      if (error) throw error

      router.push(`/game/${lobby.id}`)
    } catch (error) {
      console.error('Error joining lobby:', error)
      showToast('Failed to join lobby', 'error')
    } finally {
      setIsJoining(false)
    }
  }

  const handlePasswordJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!joiningLobby || !user) return

    try {
      setIsJoining(true)

      // Verify password
      const { data: lobby, error: verifyError } = await supabase
        .from('lobbies')
        .select('password')
        .eq('id', joiningLobby.id)
        .single()

      if (verifyError) throw verifyError

      if (lobby.password !== joinPassword) {
        showToast('Incorrect password', 'error')
        return
      }

      // Join the lobby
      const { error: joinError } = await supabase
        .from('lobby_members')
        .insert({
          lobby_id: joiningLobby.id,
          user_id: user.id
        })

      if (joinError) throw joinError

      setJoiningLobby(null)
      setJoinPassword('')
      router.push(`/game/${joiningLobby.id}`)
    } catch (error) {
      console.error('Error joining lobby:', error)
      showToast('Failed to join lobby', 'error')
    } finally {
      setIsJoining(false)
    }
  }

  const deleteLobby = async (lobbyId: string) => {
    if (!user) return

    try {
      // First delete all lobby members
      const { error: membersError } = await supabase
        .from('lobby_members')
        .delete()
        .eq('lobby_id', lobbyId)

      if (membersError) throw membersError

      // Then delete the lobby
      const { error: lobbyError } = await supabase
        .from('lobbies')
        .delete()
        .eq('id', lobbyId)
        .eq('host_id', user.id) // Extra safety check

      if (lobbyError) throw lobbyError

      showToast('Lobby deleted successfully', 'success')
      fetchLobbies()
    } catch (error) {
      console.error('Error deleting lobby:', error)
      showToast('Failed to delete lobby', 'error')
    }
  }

  const leaveLobby = async (lobbyId: string) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('lobby_members')
        .delete()
        .eq('lobby_id', lobbyId)
        .eq('user_id', user.id)

      if (error) throw error

      showToast('Left lobby successfully', 'success')
      fetchLobbies()
    } catch (error) {
      console.error('Error leaving lobby:', error)
      showToast('Failed to leave lobby', 'error')
    }
  }

  // Sort lobbies to show user's hosted lobby first
  const sortedLobbies = [...lobbies].sort((a, b) => {
    if (a.host_id === user?.id) return -1
    if (b.host_id === user?.id) return 1
    return 0
  })

  return (
    <PageTransition>
      <main className="min-h-screen pt-20 pb-8 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid gap-4">
            {/* Only show create lobby card if user doesn't have an active lobby */}
            {!sortedLobbies.some(lobby => lobby.host_id === user?.id) && (
              <Card
                onClick={() => user ? setShowCreateModal(true) : showToast('Please sign in to create a lobby', 'error')}
                className="p-6 border-dashed hover:border-solid hover:border-purple-400/50"
              >
                <div className="flex items-center justify-center gap-3 text-white/60">
                  <Plus className="w-5 h-5" />
                  <span className="text-lg">Create New Lobby</span>
                </div>
              </Card>
            )}

            {/* Lobby List */}
            {sortedLobbies.map(lobby => (
              <Card
                key={lobby.id}
                className="p-6"
                pinned={lobby.host_id === user?.id}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-white/90">
                        {lobby.name}
                      </h3>
                      {lobby.password && (
                        <div className="bg-white/10 p-1 rounded-md">
                          <Lock className="w-4 h-4 text-pink-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-white/50">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{lobby._count.members}/{lobby.max_players}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {format(lobby.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-white/40">
                        <span>Created by</span>
                        <span className="text-white/60 font-medium">
                          {lobby.host.display_name}
                        </span>
                      </div>
                    </div>
                  </div>
                  {lobby.host_id === user?.id ? (
                    <div className="flex items-center gap-4">
                      {lobby._count.members < lobby.max_players && (
                        <div className="text-sm text-white/40 italic animate-pulse">
                          Waiting for players...
                        </div>
                      )}
                      <Button
                        onClick={() => deleteLobby(lobby.id)}
                        className="bg-white/10 hover:bg-white/20 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Leave
                      </Button>
                    </div>
                  ) : lobby.is_member ? (
                    <Button
                      onClick={() => leaveLobby(lobby.id)}
                      className="bg-white/10 hover:bg-white/20 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Leave
                    </Button>
                  ) : (
                    <Button
                      onClick={() => joinLobby(lobby)}
                      disabled={lobby._count.members >= lobby.max_players || isJoining}
                      className="bg-white/10 from-transparent to-transparent hover:bg-white/20 flex items-center gap-2"
                    >
                      {lobby.password && <Lock className="w-4 h-4" />}
                      Join
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {lobbies.length === 0 && (
              <div className="text-center py-12 text-white/50">
                No active lobbies. Create one to get started!
              </div>
            )}
          </div>
        </div>

        {/* Create Lobby Modal */}
        <ActionModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false)
            resetCreateForm()
          }}
          word=""
          mode="info"
          title="Create Lobby"
          hideButtons
        >
          <form onSubmit={(e) => { e.preventDefault(); createLobby(); }} className="space-y-6">
            <Input
              type="text"
              placeholder="Lobby Name"
              value={newLobbyName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLobbyName(e.target.value)}
              className="w-full"
              autoFocus
              required
            />
            
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password (Optional)"
                value={lobbyPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLobbyPassword(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-white/40 italic">Leave empty for a public lobby</p>
            </div>

            <Button
              type="submit"
              disabled={!newLobbyName.trim() || isCreating}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {isCreating ? 'Creating...' : 'Create Lobby'}
            </Button>
          </form>
        </ActionModal>

        {/* Add Password Join Modal */}
        <ActionModal
          isOpen={!!joiningLobby}
          onClose={() => {
            setJoiningLobby(null)
            setJoinPassword('')
          }}
          word=""
          mode="info"
          title="Enter Lobby Password"
          hideButtons
        >
          <form onSubmit={handlePasswordJoin} className="space-y-6">
            <Input
              type="password"
              placeholder="Password"
              value={joinPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinPassword(e.target.value)}
              className="w-full"
              autoFocus
              required
            />
            
            <Button
              type="submit"
              disabled={!joinPassword.trim() || isJoining}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {isJoining ? 'Joining...' : 'Join Lobby'}
            </Button>
          </form>
        </ActionModal>
      </main>
    </PageTransition>
  )
} 