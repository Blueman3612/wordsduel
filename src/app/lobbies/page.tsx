'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ActionModal } from '@/components/game/ActionModal'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { PageTransition } from '@/components/layout/PageTransition'
import { Plus, Users, Clock, Lock, LogOut, ArrowLeft, Play, Timer } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { format } from 'timeago.js'

interface Lobby {
  id: string
  name: string
  host_id: string
  created_at: string
  status: 'waiting' | 'in_progress' | 'completed'
  max_players: number
  game_config: {
    base_time: number // in milliseconds
    increment: number // in milliseconds
  }
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

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
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
  const [baseTime, setBaseTime] = useState(180) // in seconds (3 minutes default)
  const [increment, setIncrement] = useState(5) // in seconds
  const [baseTimeInput, setBaseTimeInput] = useState(formatTime(180))

  const fetchLobbies = useCallback(async () => {
    if (!user) return // Don't fetch if there's no user
    
    try {
      // Get all lobbies with their members
      const { data: lobbiesData, error: lobbiesError } = await supabase
        .from('lobbies')
        .select(`
          *,
          lobby_members (
            user_id
          )
        `)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })

      if (lobbiesError) {
        console.error('Error fetching lobbies:', lobbiesError)
        return
      }

      // Get all host profiles in a single query
      const hostIds = lobbiesData?.map(lobby => lobby.host_id) || []
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', hostIds)

      // Create a map of host IDs to display names
      const hostDisplayNames = new Map(
        profiles?.map(profile => [profile.id, profile.display_name]) || []
      )

      // Process lobbies using the joined data
      const processedLobbies = lobbiesData?.map(lobby => ({
        ...lobby,
        host: {
          display_name: hostDisplayNames.get(lobby.host_id) || 'Unknown'
        },
        _count: {
          members: lobby.lobby_members?.length || 0
        },
        is_member: lobby.lobby_members?.some((member: { user_id: string }) => member.user_id === user.id) || false
      })) || []

      // Filter out full lobbies unless user is a member
      const filteredLobbies = processedLobbies.filter(lobby => 
        lobby.is_member || lobby._count.members < lobby.max_players
      )

      setLobbies(filteredLobbies)
    } catch (error) {
      console.error('Error fetching lobbies:', error)
      setLobbies([])
    }
  }, [user])

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
        async () => {
          // Check if user is in a full lobby
          const { data: userLobbies, error: userLobbyError } = await supabase
            .from('lobby_members')
            .select('lobby_id')
            .eq('user_id', user.id)

          if (userLobbyError) {
            console.error('Error checking user lobbies:', userLobbyError)
            return
          }

          if (userLobbies && userLobbies.length > 0) {
            const userLobby = userLobbies[0] // Take the first lobby if user is in multiple
            const { data: lobbies, error: lobbyError } = await supabase
              .from('lobbies')
              .select('id, max_players, status')
              .eq('id', userLobby.lobby_id)
              .eq('status', 'waiting')

            if (lobbyError) {
              console.error('Error checking lobby:', lobbyError)
              return
            }

            if (lobbies && lobbies.length > 0) {
              const lobby = lobbies[0]
              const { count } = await supabase
                .from('lobby_members')
                .select('*', { count: 'exact', head: true })
                .eq('lobby_id', userLobby.lobby_id)

              if (count && count >= lobby.max_players) {
                router.push(`/game/${userLobby.lobby_id}`)
                return
              }
            }
          }

          fetchLobbies()
        }
      )
      .subscribe()

    // Refresh lobbies less frequently to prevent 406 errors
    const refreshInterval = setInterval(fetchLobbies, 3000)

    return () => {
      supabase.removeChannel(lobbySubscription)
      clearInterval(refreshInterval)
    }
  }, [user, router, fetchLobbies])

  const createLobby = async () => {
    if (!user) return

    try {
      setIsCreating(true)

      // Check if user already has a lobby
      const { data: existingLobbies, error: existingError } = await supabase
        .from('lobbies')
        .select('id')
        .eq('host_id', user.id)
        .eq('status', 'waiting')

      if (existingError) throw existingError
      if (existingLobbies && existingLobbies.length > 0) {
        showToast('You already have an active lobby', 'error')
        return
      }

      // Get the user's display name for the default lobby name
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)

      if (profileError) throw profileError

      const displayName = profiles?.[0]?.display_name || user.email?.split('@')[0] || 'Player'
      const lobbyName = newLobbyName.trim() || `${displayName}'s Lobby`

      const { data: lobbies, error: createError } = await supabase
        .from('lobbies')
        .insert({
          name: lobbyName,
          host_id: user.id,
          max_players: 2,
          password: lobbyPassword.trim() || null,
          game_config: {
            base_time: baseTime * 1000, // convert seconds to milliseconds
            increment: increment * 1000 // convert seconds to milliseconds
          }
        })
        .select()

      if (createError) throw createError
      if (!lobbies || lobbies.length === 0) {
        throw new Error('No lobby was created')
      }

      const lobby = lobbies[0]

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
    setBaseTime(180) // Reset to 3 minutes in seconds
    setIncrement(5)
    setBaseTimeInput(formatTime(180)) // Reset the input display to "3:00"
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
      const { data: lobbies, error: verifyError } = await supabase
        .from('lobbies')
        .select('password')
        .eq('id', joiningLobby.id)

      if (verifyError) throw verifyError
      if (!lobbies || lobbies.length === 0) {
        showToast('Lobby not found', 'error')
        return
      }

      const lobby = lobbies[0]
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
        {/* Back Button */}
        <button 
          onClick={() => router.push('/')}
          className="fixed top-4 left-4 p-3 z-50 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-xl border border-white/10 transition-all duration-200 text-white/60 hover:text-white/90 hover:scale-105 active:scale-95"
          aria-label="Go back to home"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

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
                    {/* Top Row */}
                    <div className="flex items-center gap-4">
                      <h3 className="text-lg font-medium text-white/90 flex items-center gap-2">
                        {lobby.name}
                        {lobby.password && (
                          <div className="bg-white/10 p-1 rounded-md">
                            <Lock className="w-4 h-4 text-pink-400" />
                          </div>
                        )}
                      </h3>
                      <div className="flex items-center gap-2 text-white/60 bg-white/5 px-3 py-1 rounded-lg">
                        <Timer className="w-4 h-4" />
                        <span>{formatTime(lobby.game_config.base_time / 1000)}</span>
                        <span className="text-white/40">|</span>
                        <span>+{lobby.game_config.increment / 1000}s</span>
                      </div>
                    </div>
                    {/* Bottom Row */}
                    <div className="flex items-center gap-4 mt-2 text-sm text-white/50">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{lobby._count.members}/{lobby.max_players}</span>
                      </div>
                      <div className="flex items-center gap-1 text-white/40">
                        <span>Created by</span>
                        <span className="text-white/60 font-medium">
                          {lobby.host.display_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {format(lobby.created_at)}
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
                    <div className="flex items-center gap-4">
                      {lobby._count.members >= lobby.max_players && (
                        <Button
                          onClick={() => router.push(`/game/${lobby.id}`)}
                          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 flex items-center gap-2 animate-pulse-subtle"
                        >
                          <Play className="w-4 h-4" />
                          Join
                        </Button>
                      )}
                      <Button
                        onClick={() => leaveLobby(lobby.id)}
                        className="bg-white/10 hover:bg-white/20 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Leave
                      </Button>
                    </div>
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
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Lobby Name (Optional)"
                value={newLobbyName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLobbyName(e.target.value)}
                className="w-full"
                autoFocus
              />
              <p className="text-xs text-white/40 italic">Leave empty to use your username</p>
            </div>

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
            
            {/* Time Controls - Moved below lobby name and password */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white/70">Time Controls</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm text-white/60">
                    Base Time
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={baseTimeInput}
                      onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                        // Store the current formatted time when focusing
                        setBaseTimeInput(formatTime(baseTime))
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        let input = e.target.value.replace(/[^\d:]/g, '')
                        
                        // Remove any existing colons for consistent handling
                        input = input.replace(/:/g, '')
                        
                        // Limit to 4 digits maximum
                        if (input.length > 4) {
                          input = input.slice(0, 4)
                        }
                        
                        // Handle backspace and general input
                        if (input.length > 0) {
                          // If 1-2 digits, treat as minutes
                          if (input.length <= 2) {
                            const minutes = parseInt(input) || 0
                            const totalSeconds = minutes * 60
                            // Clamp the value between 30 seconds and 1 hour
                            const clampedSeconds = Math.min(3600, Math.max(30, totalSeconds))
                            setBaseTime(clampedSeconds)
                            setBaseTimeInput(input)
                            return
                          }
                          
                          // For 3-4 digits, format as MM:SS
                          const minutes = parseInt(input.slice(0, -2)) || 0
                          const seconds = parseInt(input.slice(-2)) || 0
                          const totalSeconds = minutes * 60 + seconds
                          
                          // Clamp the value between 30 seconds and 1 hour
                          const clampedSeconds = Math.min(3600, Math.max(30, totalSeconds))
                          setBaseTime(clampedSeconds)
                          
                          // Format with colon
                          input = input.slice(0, -2) + ':' + input.slice(-2)
                        }
                        
                        // Always update the input field to show what user is typing
                        setBaseTimeInput(input)
                      }}
                      onBlur={() => {
                        // On blur, if input is 1-2 digits, format as minutes:seconds
                        if (!baseTimeInput.includes(':') && baseTimeInput.length <= 2) {
                          const minutes = parseInt(baseTimeInput) || 0
                          const totalSeconds = minutes * 60
                          // Clamp the value between 30 seconds and 1 hour
                          const clampedSeconds = Math.min(3600, Math.max(30, totalSeconds))
                          setBaseTime(clampedSeconds)
                          setBaseTimeInput(formatTime(clampedSeconds))
                        } else {
                          // Otherwise reformat to valid time
                          setBaseTimeInput(formatTime(baseTime))
                        }
                      }}
                      className="w-full pr-8 text-center"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const newTime = Math.min(3600, baseTime + 30)
                          setBaseTime(newTime)
                          setBaseTimeInput(formatTime(newTime))
                        }}
                        className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/60 hover:text-white/90"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 15l-6-6-6 6"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newTime = Math.max(30, baseTime - 30)
                          setBaseTime(newTime)
                          setBaseTimeInput(formatTime(newTime))
                        }}
                        className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/60 hover:text-white/90"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm text-white/60">
                    Increment (seconds)
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="30"
                      value={increment}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                        setIncrement(Math.min(30, Math.max(0, parseInt(e.target.value) || 5)))}
                      className="w-full pr-8 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => setIncrement(prev => Math.min(30, prev + 1))}
                        className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/60 hover:text-white/90"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 15l-6-6-6 6"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIncrement(prev => Math.max(0, prev - 1))}
                        className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/60 hover:text-white/90"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isCreating}
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