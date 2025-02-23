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
  created_at: string
}

interface PresenceState {
  user_id: string
  online_at: string
}

type GameStateInternal = {
  currentTurn: number
  baseTime: number
  status: 'active' | 'paused' | 'finished'
  lastCalculation: number // Track when we last calculated time
  animationFrameId?: number // Track animation frame
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

  // Calculate time remaining based purely on timestamps
  private calculateTimeRemaining(now: number = Date.now()): { player1Time: number; player2Time: number } {
    if (!this.lastKnownState) {
      return { player1Time: 0, player2Time: 0 };
    }

    // Start with base time for both players
    let player1Time = this.lastKnownState.baseTime;
    let player2Time = this.lastKnownState.baseTime;

    // Get cached words (we'll update this on word subscription)
    const words = this._cachedWords || [];

    // If no words played, return full time for both players
    if (words.length === 0) {
      return { player1Time, player2Time };
    }

    const timeIncrement = this._timeIncrement || 5000;
    const firstWord = words[0];
    const player1Id = firstWord.player_id; // Host/first player's ID

    // Count words played by each player for increments
    const player1Words = words.filter(w => w.player_id === player1Id);
    const player2Words = words.filter(w => w.player_id !== player1Id);

    // Add time increments
    player1Time += timeIncrement * player1Words.length;
    player2Time += timeIncrement * player2Words.length;

    // Process time used between moves
    for (let i = 0; i < words.length - 1; i++) {
      const currentWord = words[i];
      const nextWord = words[i + 1];
      const timeUsed = new Date(nextWord.created_at).getTime() - new Date(currentWord.created_at).getTime();

      // Subtract time from the player whose turn it WAS (opposite of who played)
      // If player1 played currentWord, it means player2 was thinking during this time
      if (currentWord.player_id === player1Id) {
        player2Time = Math.max(0, player2Time - timeUsed);
      } else {
        player1Time = Math.max(0, player1Time - timeUsed);
      }
    }

    // Calculate time since last move for current player
    const lastWord = words[words.length - 1];
    const lastMoveTime = new Date(lastWord.created_at).getTime();
    const elapsedSinceLastMove = now - lastMoveTime;

    // Subtract elapsed time from the player whose turn it currently is
    // If player1 played last, then player2 is currently thinking
    if (lastWord.player_id === player1Id) {
      player2Time = Math.max(0, player2Time - elapsedSinceLastMove);
    } else {
      player1Time = Math.max(0, player1Time - elapsedSinceLastMove);
    }

    return { player1Time, player2Time };
  }

  private _cachedWords: Array<{ created_at: string; player_id: string }> = [];
  private _timeIncrement: number = 5000;
  private _gameStartTime: number = Date.now();

  private updateTimers = () => {
    if (!this.lastKnownState || this.lastKnownState.status !== 'active') {
      if (this.lastKnownState?.animationFrameId) {
        cancelAnimationFrame(this.lastKnownState.animationFrameId);
      }
      return;
    }

    const now = Date.now();
    const { player1Time, player2Time } = this.calculateTimeRemaining(now);
    
    // Update UI
    this.callbacks.onTimerUpdate?.(player1Time, player2Time);

    // Check for game over
    if ((player1Time <= 0 || player2Time <= 0) && this.lastKnownState.status === 'active') {
      this.endGame();
      return;
    }

    // Schedule next update
    this.lastKnownState.animationFrameId = requestAnimationFrame(this.updateTimers);
  }

  private async endGame() {
    // Attempt atomic update to end game
    const { error } = await supabase
      .from('game_state')
      .update({ 
        status: 'finished',
        updated_at: new Date().toISOString(),
        updated_by: this.userId
      })
      .eq('lobby_id', this.lobbyId)
      .eq('status', 'active'); // Only update if still active

    if (!error) {
      console.log('Game ended due to time expiration');
      if (this.lastKnownState?.animationFrameId) {
        cancelAnimationFrame(this.lastKnownState.animationFrameId);
      }
    }
  }

  async initialize() {
    if (this.channel) {
      console.warn('Channel already initialized');
      return;
    }

    try {
      // Get initial configuration
      const [{ data: lobbyData }, { data: words }] = await Promise.all([
        supabase
          .from('lobbies')
          .select('game_config')
          .eq('id', this.lobbyId)
          .single(),
        supabase
          .from('game_words')
          .select('created_at, player_id')
          .eq('lobby_id', this.lobbyId)
          .order('created_at', { ascending: true })
      ]);

      // Store configuration
      const baseTime = lobbyData?.game_config?.base_time || 180000;
      this._timeIncrement = lobbyData?.game_config?.increment || 5000;
      this._cachedWords = words || [];
      this._gameStartTime = Date.now();

      // Set up the channel
      this.channel = supabase.channel(`game_room:${this.lobbyId}`);

      // Get profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', this.userId)
        .maybeSingle();

      // Set up presence handlers (keep existing presence code)
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

      // Set up game state subscription
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
          
          if (newState && newState.status) {
            const currentTurn = await this.determineCurrentTurn();
            
            this.lastKnownState = {
              currentTurn,
              baseTime,
              status: newState.status
            };

            // Update timers when game state changes
            this.updateTimers();
          }

          this.callbacks.onGameStateChange?.(payload as RealtimePostgresChangesPayload<GameState>);
        }
      );

      // Update game words cache on new words
      this.channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_words',
          filter: `lobby_id=eq.${this.lobbyId}`
        },
        async (payload: RealtimePostgresChangesPayload<GameWord>) => {
          const newWord = payload.new;
          if (newWord) {
            this._cachedWords.push({
              created_at: newWord.created_at,
              player_id: newWord.player_id
            });
          }

          const currentTurn = await this.determineCurrentTurn();
          if (this.lastKnownState) {
            this.lastKnownState.currentTurn = currentTurn;
          }

          this.callbacks.onGameWordAdded?.(payload);
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

      // Initialize game state if host
      if (this.isHost) {
        const { data: existingState } = await supabase
          .from('game_state')
          .select('*')
          .eq('lobby_id', this.lobbyId)
          .maybeSingle();

        if (!existingState) {
          const currentTurn = await this.determineCurrentTurn();

          await supabase
            .from('game_state')
            .insert({
              lobby_id: this.lobbyId,
              current_turn: currentTurn,
              status: 'active',
              banned_letters: this.getInitialBannedLetters(),
              last_move_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              updated_by: this.userId
            })
            .select()
            .single();
        }
      }

      // Initialize state and start animation
      const currentTurn = await this.determineCurrentTurn();
      const initialState: GameStateInternal = {
        currentTurn,
        baseTime,
        status: 'active',
        lastCalculation: Date.now(),
        animationFrameId: undefined
      };
      this.lastKnownState = initialState;

      // Start smooth animation
      requestAnimationFrame(this.updateTimers);

    } catch (error) {
      console.error('Error in subscription initialization:', error);
    }
  }

  cleanup() {
    if (this.lastKnownState?.animationFrameId) {
      cancelAnimationFrame(this.lastKnownState.animationFrameId);
    }
    if (this.channel) {
      this.channel.untrack();
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
} 