'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ActionModal } from '@/components/game/ActionModal'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { PageTransition } from '@/components/layout/PageTransition'
import { Plus, Users, Clock } from 'lucide-react'
import { Input } from '@/components/ui/Input'

interface Lobby {
  id: string
  name: string
  host_id: string
  created_at: string
  status: 'waiting' | 'in_progress' | 'completed'
  max_players: number
  game_config: any
  host: {
    display_name: string
  }
  _count: {
    members: number
  }
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

export default function LobbiesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newLobbyName, setNewLobbyName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Fetch initial lobbies and set up real-time subscription
  useEffect(() => {
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

    return () => {
      supabase.removeChannel(lobbySubscription)
    }
  }, [])

  const fetchLobbies = async () => {
    try {
      // First get the lobbies
      const { data: lobbiesData, error: lobbiesError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })

      if (lobbiesError) {
        console.error('Error fetching lobbies:', lobbiesError)
        return
      }

      // Then get the member counts for each lobby
      const lobbiesWithCounts = await Promise.all((lobbiesData ?? []).map(async (lobby) => {
        const { count, error: countError } = await supabase
          .from('lobby_members')
          .select('*', { count: 'exact', head: true })
          .eq('lobby_id', lobby.id)

        if (countError) {
          console.error('Error counting members:', countError)
          return null
        }

        // Get the host's email
        const { data: hostData, error: hostError } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', lobby.host_id)
          .single()

        if (hostError) {
          console.error('Error fetching host:', hostError)
          return null
        }

        return {
          ...lobby,
          host: {
            display_name: hostData?.display_name || 'Unknown'
          },
          _count: {
            members: count || 0
          }
        }
      }))

      // Filter out any null results and set the lobbies
      setLobbies(lobbiesWithCounts.filter((lobby): lobby is Lobby => lobby !== null))
    } catch (error) {
      console.error('Error fetching lobbies:', error)
      setLobbies([])
    }
  }

  const createLobby = async () => {
    if (!user || !newLobbyName.trim()) return

    try {
      setIsCreating(true)

      const { data: lobby, error: createError } = await supabase
        .from('lobbies')
        .insert({
          name: newLobbyName.trim(),
          host_id: user.id,
          max_players: 2
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
      setNewLobbyName('')
      router.push(`/game/${lobby.id}`)
    } catch (error) {
      console.error('Error creating lobby:', error)
      showToast('Failed to create lobby', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const joinLobby = async (lobbyId: string) => {
    if (!user) {
      showToast('Please sign in to join a lobby', 'error')
      return
    }

    try {
      const { error } = await supabase
        .from('lobby_members')
        .insert({
          lobby_id: lobbyId,
          user_id: user.id
        })

      if (error) throw error

      router.push(`/game/${lobbyId}`)
    } catch (error) {
      console.error('Error joining lobby:', error)
      showToast('Failed to join lobby', 'error')
    }
  }

  return (
    <PageTransition>
      <main className="min-h-screen pt-20 pb-8 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-white">Game Lobbies</h1>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Lobby
            </Button>
          </div>

          {/* Lobby List */}
          <div className="grid gap-4">
            {lobbies.map(lobby => (
              <div
                key={lobby.id}
                className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-white/90">
                      {lobby.name}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-white/50">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{lobby._count.members}/{lobby.max_players}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {new Date(lobby.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => joinLobby(lobby.id)}
                    disabled={lobby._count.members >= lobby.max_players || lobby.host_id === user?.id}
                    className="bg-white/10 from-transparent to-transparent hover:bg-white/20"
                  >
                    {lobby.host_id === user?.id ? 'Your Lobby' : 'Join'}
                  </Button>
                </div>
              </div>
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
            setNewLobbyName('')
          }}
          word=""
          mode="info"
          title="Create Lobby"
        >
          <div className="space-y-6">
            <Input
              type="text"
              placeholder="Lobby Name"
              value={newLobbyName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLobbyName(e.target.value)}
              className="w-full"
            />
            <Button
              onClick={createLobby}
              disabled={!newLobbyName.trim() || isCreating}
              className="w-full"
            >
              {isCreating ? 'Creating...' : 'Create Lobby'}
            </Button>
          </div>
        </ActionModal>
      </main>
    </PageTransition>
  )
} 