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

  private async determineCurrentTurn(): Promise<number> {
    try {
      // Get the last played word
      const { data: words, error } = await supabase
        .from('game_words')
        .select('player_id')
        .eq('lobby_id', this.lobbyId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching last word:', error);
        return 0; // Default to player 1's turn on error
      }

      // If no words played yet, it's player 1's turn
      if (!words || words.length === 0) {
        return 0;
      }

      const lastWord = words[0];

      // Get the player indices
      const { data: players } = await supabase
        .from('lobby_members')
        .select('user_id')
        .eq('lobby_id', this.lobbyId)
        .order('joined_at', { ascending: true });

      if (!players || players.length < 2) {
        return 0;
      }

      // If last player was player 1 (index 0), it's player 2's turn (index 1) and vice versa
      return lastWord.player_id === players[0].user_id ? 1 : 0;
    } catch (error) {
      console.error('Error in determineCurrentTurn:', error);
      return 0;
    }
  }

  private async synchronizeTimers(): Promise<{ player1Time: number; player2Time: number; currentTurn: number }> {
    try {
      // Get the last word played and the game state
      const [{ data: words }, { data: gameState }] = await Promise.all([
        supabase
          .from('game_words')
          .select('created_at, player_id')
          .eq('lobby_id', this.lobbyId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('game_state')
          .select('player1_time, player2_time, last_move_at')
          .eq('lobby_id', this.lobbyId)
          .single()
      ]);

      if (!gameState) {
        console.error('No game state found during timer sync');
        return { player1Time: 0, player2Time: 0, currentTurn: 0 };
      }

      // Get current turn based on last word
      const currentTurn = await this.determineCurrentTurn();

      // If no words played, return the base times
      if (!words || words.length === 0) {
        return {
          player1Time: gameState.player1_time,
          player2Time: gameState.player2_time,
          currentTurn
        };
      }

      // Calculate time elapsed since last move
      const lastMoveTime = new Date(words[0].created_at).getTime();
      const currentTime = Date.now();
      const elapsedTime = currentTime - lastMoveTime;

      // Get the stored times from game state
      const times = {
        player1Time: gameState.player1_time,
        player2Time: gameState.player2_time,
        currentTurn
      };

      // Only subtract elapsed time from the current player's timer
      if (currentTurn === 0) {
        times.player1Time = Math.max(0, times.player1Time - elapsedTime);
      } else {
        times.player2Time = Math.max(0, times.player2Time - elapsedTime);
      }

      return times;
    } catch (error) {
      console.error('Error synchronizing timers:', error);
      return this.lastKnownState ? {
        player1Time: this.lastKnownState.player1Time,
        player2Time: this.lastKnownState.player2Time,
        currentTurn: this.lastKnownState.currentTurn
      } : { player1Time: 0, player2Time: 0, currentTurn: 0 };
    }
  }

  private startTimerUpdates() {
    // Clear any existing timer first
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Start a local timer that just counts down based on the last sync
    this.timerInterval = setInterval(() => {
      if (!this.lastKnownState || this.lastKnownState.status !== 'active') {
        if (this.timerInterval) clearInterval(this.timerInterval);
        return;
      }

      const currentTime = this.lastKnownState.currentTurn === 0 
        ? this.lastKnownState.player1Time 
        : this.lastKnownState.player2Time;

      if (currentTime <= 0) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        return;
      }

      // Just decrement the appropriate timer locally
      const newTime = Math.max(0, currentTime - 1000);
      const newState = {
        ...this.lastKnownState,
        player1Time: this.lastKnownState.currentTurn === 0 ? newTime : this.lastKnownState.player1Time,
        player2Time: this.lastKnownState.currentTurn === 1 ? newTime : this.lastKnownState.player2Time
      };

      this.lastKnownState = newState;
      this.callbacks.onTimerUpdate?.(newState.player1Time, newState.player2Time);
    }, 1000);
  }

  // Modify handleTurnChange to be more precise
  private handleTurnChange(newState: GameState) {
    // Always clear existing timer first
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Synchronize timers and update state
    this.synchronizeTimers().then(({ player1Time, player2Time, currentTurn }) => {
      this.lastKnownState = {
        currentTurn,
        player1Time,
        player2Time,
        lastMoveAt: newState.last_move_at,
        status: newState.status as 'active' | 'paused' | 'finished'
      };

      // Only host restarts timer if game is active
      if (this.isHost && newState.status === 'active') {
        this.startTimerUpdates();
      }
    });
  }

  async initialize() {
    if (this.channel) {
      console.warn('Channel already initialized');
      return;
    }

    try {
      // First set up the channel
      this.channel = supabase.channel(`game_room:${this.lobbyId}`, {
        config: {
          presence: {
            key: this.userId,
          },
        },
      });

      // Get profile data first
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', this.userId)
        .maybeSingle();

      // Set up all channel handlers
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
        });

      // Set up game state subscription with turn change handling
      this.channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `lobby_id=eq.${this.lobbyId}`
        },
        async (payload) => {
          const newState = (payload as RealtimePostgresChangesPayload<GameState>).new as GameState;
          const oldState = (payload as RealtimePostgresChangesPayload<GameState>).old as GameState;
          
          if (newState && newState.status) {
            // Determine current turn from game_words instead of relying on game_state
            const currentTurn = await this.determineCurrentTurn();
            newState.current_turn = currentTurn;

            // Check if turn has changed
            if (oldState && currentTurn !== oldState.current_turn) {
              this.handleTurnChange(newState);
            } else {
              this.lastKnownState = {
                currentTurn: currentTurn,
                player1Time: newState.player1_time,
                player2Time: newState.player2_time,
                lastMoveAt: newState.last_move_at,
                status: newState.status
              };
            }
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
        async (payload) => {
          // When a new word is played, sync with server
          if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
          }

          const { player1Time, player2Time, currentTurn } = await this.synchronizeTimers();
          
          if (this.lastKnownState) {
            this.lastKnownState = {
              ...this.lastKnownState,
              currentTurn,
              player1Time,
              player2Time
            };
          }

          // Start local timer
          this.startTimerUpdates();

          this.callbacks.onGameWordAdded?.(payload as RealtimePostgresChangesPayload<GameWord>);
        }
      );

      // Subscribe and track presence
      await new Promise<void>((resolve) => {
        this.channel?.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await this.channel?.track({
              user_id: this.userId,
              online_at: new Date().toISOString(),
              display_name: profile?.display_name,
              avatar_url: profile?.avatar_url
            });
            resolve();
          }
        });
      });

      // After channel is fully subscribed, handle game state
      const { data: existingState } = await supabase
        .from('game_state')
        .select('*')
        .eq('lobby_id', this.lobbyId)
        .maybeSingle();

      // If we're the host and no state exists, create it
      if (!existingState && this.isHost) {
        const { data: lobbyData } = await supabase
          .from('lobbies')
          .select('game_config')
          .eq('id', this.lobbyId)
          .single();

        const baseTime = lobbyData?.game_config?.base_time || 180000;
        
        // Determine the current turn based on game_words
        const currentTurn = await this.determineCurrentTurn();

        // Try to create game state with a unique constraint check
        const { data: newState, error } = await supabase
          .from('game_state')
          .insert({
            lobby_id: this.lobbyId,
            current_turn: currentTurn, // Use the determined turn
            player1_time: baseTime,
            player2_time: baseTime,
            player1_score: 0,
            player2_score: 0,
            status: 'active',
            banned_letters: this.getInitialBannedLetters(),
            last_move_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: this.userId
          })
          .select()
          .single();

        // If insert failed, try to get existing state one more time
        if (error) {
          const { data: retryState } = await supabase
            .from('game_state')
            .select('*')
            .eq('lobby_id', this.lobbyId)
            .single();

          if (retryState) {
            const currentTurn = await this.determineCurrentTurn();
            this.lastKnownState = {
              currentTurn: currentTurn,
              player1Time: retryState.player1_time,
              player2Time: retryState.player2_time,
              lastMoveAt: retryState.last_move_at,
              status: retryState.status as 'active' | 'paused' | 'finished'
            };
          }
        } else if (newState) {
          this.lastKnownState = {
            currentTurn: currentTurn,
            player1Time: newState.player1_time,
            player2Time: newState.player2_time,
            lastMoveAt: newState.last_move_at,
            status: newState.status as 'active' | 'paused' | 'finished'
          };
        }
      } else if (existingState) {
        const currentTurn = await this.determineCurrentTurn();
        this.lastKnownState = {
          currentTurn: currentTurn,
          player1Time: existingState.player1_time,
          player2Time: existingState.player2_time,
          lastMoveAt: existingState.last_move_at,
          status: existingState.status as 'active' | 'paused' | 'finished'
        };
      }

      // Start timer updates after everything is initialized
      if (this.isHost && this.lastKnownState?.status === 'active') {
        setTimeout(() => {
          this.startTimerUpdates();
        }, 1000);
      }

    } catch (error) {
      console.error('Error in subscription initialization:', error);
    }
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