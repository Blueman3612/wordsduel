import { RealtimeChannel, RealtimePostgresChangesPayload, RealtimePresenceState } from '@supabase/supabase-js'
import { supabase } from './client'

interface GameState {
  lobby_id: string
  current_turn: number
  player1_time: number
  player2_time: number
  player1_score: number
  player2_score: number
  status: 'active' | 'paused' | 'finished'
  banned_letters: string[]
  last_move_at: string
  updated_at: string
  updated_by: string
  elo_updated?: boolean
}

interface GameWord {
  lobby_id: string
  word: string
  player_id: string
  is_valid: boolean
  score: number
  score_breakdown: {
    lengthScore: number
    levenBonus: number
    rarityBonus: number
  }
  part_of_speech?: string
  definition?: string
  phonetics?: string
}

interface PresenceState {
  user_id: string
  online_at: string
}

type GameStateInternal = {
  currentTurn: number
  player1Time: number
  player2Time: number
  lastMoveAt: string
  status: 'active' | 'paused' | 'finished'
}

type SubscriptionCallbacks = {
  onGameStateChange?: (payload: RealtimePostgresChangesPayload<GameState>) => void
  onGameWordAdded?: (payload: RealtimePostgresChangesPayload<GameWord>) => void
  onPresenceSync?: (state: RealtimePresenceState<any>) => void
  onPlayerJoin?: (presence: { key: string; newPresences: PresenceState[] }) => void
  onPlayerLeave?: (presence: { key: string; leftPresences: PresenceState[] }) => void
  onTimerUpdate?: (player1Time: number, player2Time: number) => void
}

export class GameSubscriptionManager {
  private channel: RealtimeChannel | null = null
  private lobbyId: string
  private userId: string
  private isHost: boolean
  private callbacks: SubscriptionCallbacks
  private timerInterval: NodeJS.Timeout | null = null
  private lastKnownState: GameStateInternal | null = null
  private getInitialBannedLetters: () => string[]

  constructor(
    lobbyId: string, 
    userId: string, 
    isHost: boolean, 
    callbacks: SubscriptionCallbacks,
    getInitialBannedLetters: () => string[]
  ) {
    this.lobbyId = lobbyId
    this.userId = userId
    this.isHost = isHost
    this.callbacks = callbacks
    this.getInitialBannedLetters = getInitialBannedLetters
  }

  private startTimerUpdates() {
    if (!this.isHost || this.timerInterval) return;

    this.timerInterval = setInterval(async () => {
      if (!this.lastKnownState || this.lastKnownState.status !== 'active') return;

      const currentPlayerTime = this.lastKnownState.currentTurn === 0 
        ? this.lastKnownState.player1Time 
        : this.lastKnownState.player2Time;

      if (currentPlayerTime <= 0) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        return;
      }

      const newTime = Math.max(0, currentPlayerTime - 1000);
      
      const newState = {
        ...this.lastKnownState,
        player1Time: this.lastKnownState.currentTurn === 0 ? newTime : this.lastKnownState.player1Time,
        player2Time: this.lastKnownState.currentTurn === 1 ? newTime : this.lastKnownState.player2Time
      };

      // Update last known state
      this.lastKnownState = newState;

      // Broadcast timer update to all clients through the channel
      await this.channel?.send({
        type: 'broadcast',
        event: 'timer_update',
        payload: {
          player1Time: newState.player1Time,
          player2Time: newState.player2Time
        }
      });

      // Notify callback of timer update
      this.callbacks.onTimerUpdate?.(newState.player1Time, newState.player2Time);

      // Only update database every 5 seconds or when timer reaches 0
      if (newTime === 0 || newTime % 5000 === 0) {
        const { error: stateError } = await supabase
          .from('game_state')
          .update({
            [this.lastKnownState.currentTurn === 0 ? 'player1_time' : 'player2_time']: newTime,
            updated_at: new Date().toISOString(),
            updated_by: this.userId
          })
          .eq('lobby_id', this.lobbyId);

        if (stateError) {
          console.error('Error updating game time:', stateError);
        }
      }
    }, 1000);
  }

  async initialize() {
    if (this.channel) {
      console.warn('Channel already initialized');
      return;
    }

    // If host, initialize game state immediately
    if (this.isHost) {
      try {
        // Get lobby config for base time
        const { data: lobbyData } = await supabase
          .from('lobbies')
          .select('game_config')
          .eq('id', this.lobbyId)
          .single();

        const baseTime = lobbyData?.game_config?.base_time || 180000;

        // Use upsert but only insert if doesn't exist
        const { data: gameState, error: stateError } = await supabase
          .from('game_state')
          .upsert({
            lobby_id: this.lobbyId,
            current_turn: 0,
            player1_time: baseTime,
            player2_time: baseTime,
            player1_score: 0,
            player2_score: 0,
            status: 'active',
            banned_letters: this.getInitialBannedLetters(),
            last_move_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: this.userId
          }, {
            onConflict: 'lobby_id',
            ignoreDuplicates: true
          })
          .select()
          .single();

        if (stateError) {
          console.error('Error initializing game state:', stateError);
          return;
        }

        if (gameState) {
          this.lastKnownState = {
            currentTurn: gameState.current_turn,
            player1Time: gameState.player1_time,
            player2Time: gameState.player2_time,
            lastMoveAt: gameState.last_move_at,
            status: gameState.status as 'active' | 'paused' | 'finished'
          };
        }
      } catch (error) {
        console.error('Error in game state initialization:', error);
      }
    }

    this.channel = supabase.channel(`game_room:${this.lobbyId}`, {
      config: {
        presence: {
          key: this.userId,
        },
      },
    });

    // Set up presence handlers
    this.channel
      .on('presence', { event: 'sync' }, async () => {
        if (!this.channel) return;
        const state = this.channel.presenceState();
        this.callbacks.onPresenceSync?.(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.callbacks.onPlayerJoin?.({ key, newPresences: newPresences as unknown as PresenceState[] });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.callbacks.onPlayerLeave?.({ key, leftPresences: leftPresences as unknown as PresenceState[] });
      })
      // Add broadcast handler for timer updates
      .on('broadcast', { event: 'timer_update' }, (payload) => {
        if (payload.payload) {
          this.callbacks.onTimerUpdate?.(payload.payload.player1Time, payload.payload.player2Time);
        }
      });

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
        const newState = (payload as RealtimePostgresChangesPayload<GameState>).new as GameState;
        
        // Update last known state for timer management
        if (newState && newState.status) {
          this.lastKnownState = {
            currentTurn: newState.current_turn,
            player1Time: newState.player1_time,
            player2Time: newState.player2_time,
            lastMoveAt: newState.last_move_at,
            status: newState.status
          };
        }

        this.callbacks.onGameStateChange?.(payload as RealtimePostgresChangesPayload<GameState>);
      }
    );

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
        this.callbacks.onGameWordAdded?.(payload as RealtimePostgresChangesPayload<GameWord>);
      }
    );

    // Subscribe and track presence
    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.channel?.track({
          user_id: this.userId,
          online_at: new Date().toISOString(),
        });
        
        // Start timer updates after successful subscription
        if (this.isHost) {
          this.startTimerUpdates();
        }
      }
    });
  }

  cleanup() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }

    if (this.channel) {
      this.channel.untrack()
      this.channel.unsubscribe()
      this.channel = null
    }
  }
} 