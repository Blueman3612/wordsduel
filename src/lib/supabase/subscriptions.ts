import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './client'

type SubscriptionCallbacks = {
  onGameStateChange?: (payload: any) => void
  onGameWordAdded?: (payload: any) => void
  onPresenceSync?: (state: Record<string, any>) => void
  onPlayerJoin?: (presence: any) => void
  onPlayerLeave?: (presence: any) => void
}

export class GameSubscriptionManager {
  private channel: RealtimeChannel | null = null
  private lobbyId: string
  private userId: string
  private isHost: boolean
  private callbacks: SubscriptionCallbacks

  constructor(lobbyId: string, userId: string, isHost: boolean, callbacks: SubscriptionCallbacks) {
    this.lobbyId = lobbyId
    this.userId = userId
    this.isHost = isHost
    this.callbacks = callbacks
  }

  async initialize() {
    if (this.channel) {
      console.warn('Channel already initialized')
      return
    }

    this.channel = supabase.channel(`game_room:${this.lobbyId}`, {
      config: {
        presence: {
          key: this.userId,
        },
      },
    })

    // Set up presence handlers
    this.channel
      .on('presence', { event: 'sync' }, () => {
        if (!this.channel) return
        const state = this.channel.presenceState()
        this.callbacks.onPresenceSync?.(state)
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.callbacks.onPlayerJoin?.({ key, newPresences })
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.callbacks.onPlayerLeave?.({ key, leftPresences })
      })

    // Set up game state subscription
    this.channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_state',
        filter: `lobby_id=eq.${this.lobbyId}`
      },
      (payload) => {
        this.callbacks.onGameStateChange?.(payload)
      }
    )

    // Set up game words subscription
    this.channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_words',
        filter: `lobby_id=eq.${this.lobbyId}`
      },
      (payload) => {
        this.callbacks.onGameWordAdded?.(payload)
      }
    )

    // Subscribe and track presence
    await this.channel.subscribe(async (status) => {
      console.log('Channel subscription status:', status)
      if (status === 'SUBSCRIBED') {
        console.log('Channel subscribed, tracking presence for user:', this.userId)
        await this.channel?.track({
          user_id: this.userId,
          online_at: new Date().toISOString(),
        })
      }
    })
  }

  cleanup() {
    if (this.channel) {
      console.log('Cleaning up subscriptions...')
      this.channel.untrack()
      this.channel.unsubscribe()
      this.channel = null
    }
  }
} 