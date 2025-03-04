'use client'

import { useState, useRef, useEffect, useCallback, useReducer } from 'react'
import { Send, X, Flag } from 'lucide-react'
import { ActionModal } from '@/components/game/ActionModal'
import { PageTransition } from '@/components/layout/PageTransition'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { Avatar } from '@/components/ui/Avatar'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils/cn'
import { calculateLevenshteinDistance, SCORING_WEIGHTS } from '@/lib/utils/word-scoring'
import { AnimatedScore } from '@/components/game/AnimatedScore'
import { Timer } from '@/components/game/Timer'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { calculateTimeRemaining, determineCurrentTurn, setupTimerAnimation } from '@/lib/game/timer'

// Interfaces
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

interface WordCard {
  word: string
  player: string
  timestamp: number
  isInvalid?: boolean
  score?: number
  scoreBreakdown?: {
    lengthScore: number
    levenBonus: number
    rarityBonus: number
  }
  dictionary?: {
    partOfSpeech?: string
    definition?: string
    phonetics?: string
  }
}

interface Player {
  id: string
  name: string
  avatar_url: string
  score: number
  elo: number
  originalElo?: number
  games_played: number
  presence_ref?: string
}

type Letter = keyof typeof SCORING_WEIGHTS.RARITY.LETTER_WEIGHTS

interface PresenceState {
  user_id: string
  online_at: string
}

interface GameOverInfo {
  winner: {
    id: string
    name: string
    elo: number
    originalElo?: number
    avatar_url: string
    score: number
  }
  loser: {
    id: string
    name: string
    elo: number
    originalElo?: number
    avatar_url: string
    score: number
  }
  reason?: 'time' | 'forfeit'
}

interface GameClientProps {
  lobbyId: string
}

// New reducer types
interface GameReducerState {
  currentTurn: number;
  player1Time: number;
  player2Time: number;
  bannedLetters: string[];
  players: Player[];
  words: WordCard[];
  word: string;
  invalidLetters: string[];
  isFlashing: boolean;
  reportedWord: string;
  onlinePlayers: Set<string>;
}

type GameStateAction =
  | { type: 'UPDATE_GAME_STATE'; payload: { currentTurn: number; player1Time: number; player2Time: number; bannedLetters: string[]; player1Score: number; player2Score: number } }
  | { type: 'UPDATE_TIMER'; payload: { player1Time: number; player2Time: number } }
  | { type: 'ADD_WORD'; payload: WordCard }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'INITIALIZE_STATE'; payload: { gameState: GameState | null; words: WordCard[]; players: Player[] } }
  | { type: 'SET_WORD'; payload: string }
  | { type: 'SET_INVALID_LETTERS'; payload: string[] }
  | { type: 'SET_FLASHING'; payload: boolean }
  | { type: 'SET_REPORTED_WORD'; payload: string }
  | { type: 'SET_ONLINE_PLAYERS'; payload: Set<string> };

// Game state reducer
function gameReducer(state: GameReducerState, action: GameStateAction): GameReducerState {
  switch (action.type) {
    case 'UPDATE_GAME_STATE':
      return {
        ...state,
        currentTurn: action.payload.currentTurn,
        player1Time: action.payload.player1Time,
        player2Time: action.payload.player2Time,
        bannedLetters: action.payload.bannedLetters,
        players: state.players.map((player: Player, index: number) => ({
          ...player,
          score: index === 0 ? action.payload.player1Score : action.payload.player2Score
        }))
      };
    
    case 'UPDATE_TIMER':
      return {
        ...state,
        player1Time: action.payload.player1Time,
        player2Time: action.payload.player2Time
      };
    
    case 'ADD_WORD':
      if (state.words.some((w: WordCard) => w.word === action.payload.word)) {
        return state;
      }
      return {
        ...state,
        words: [...state.words, action.payload]
      };
    
    case 'SET_PLAYERS':
      return {
        ...state,
        players: action.payload
      };
    
    case 'INITIALIZE_STATE':
      return {
        ...state,
        ...(action.payload.gameState ? {
          currentTurn: action.payload.gameState.current_turn,
          player1Time: action.payload.gameState.player1_time,
          player2Time: action.payload.gameState.player2_time,
          bannedLetters: action.payload.gameState.banned_letters || [],
        } : {}),
        words: action.payload.words,
        players: state.players.length > 0 ? state.players : action.payload.players
      };

    case 'SET_WORD':
      return {
        ...state,
        word: action.payload
      };

    case 'SET_INVALID_LETTERS':
      return {
        ...state,
        invalidLetters: action.payload
      };

    case 'SET_FLASHING':
      return {
        ...state,
        isFlashing: action.payload
      };

    case 'SET_REPORTED_WORD':
      return {
        ...state,
        reportedWord: action.payload
      };

    case 'SET_ONLINE_PLAYERS':
      return {
        ...state,
        onlinePlayers: action.payload
      };

    default:
      return state;
  }
}

export function GameClient({ lobbyId }: GameClientProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const router = useRouter()

  // Game parameters
  const parameters = [
    'at least 5 letters long',
    'a singular non-proper noun, adjective, adverb, or infinitive verb'
  ]
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const vowels = ['A', 'E', 'I', 'O', 'U']
  const consonants = alphabet.filter(letter => !vowels.includes(letter))

  // Initialize reducer with all state
  const [gameState, dispatch] = useReducer(gameReducer, {
    currentTurn: 0,
    player1Time: 180000,
    player2Time: 180000,
    bannedLetters: [],
    players: [],
    words: [],
    word: '',
    invalidLetters: [],
    isFlashing: false,
    reportedWord: '',
    onlinePlayers: new Set<string>([])
  } as GameReducerState);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentPlayersRef = useRef<Player[]>([]);
  const gameEndStateRef = useRef<{
    players: Player[];
    gameOverInfo: GameOverInfo | null;
  }>({
    players: [],
    gameOverInfo: null
  });

  // Keep ref in sync with state
  useEffect(() => {
    currentPlayersRef.current = gameState.players;
  }, [gameState.players]);

  // Helper function to get initial banned letters
  const getInitialBannedLetters = useCallback(() => {
    // Randomly select 3 consonants
    const shuffledConsonants = [...consonants].sort(() => Math.random() - 0.5);
    const bannedConsonants = shuffledConsonants.slice(0, 3);
    
    // Randomly select 1 vowel
    const shuffledVowels = [...vowels].sort(() => Math.random() - 0.5);
    const bannedVowel = shuffledVowels[0];
    
    return [...bannedConsonants, bannedVowel];
  }, [consonants, vowels]);

  // Helper function to get next banned letter
  const getNextBannedLetter = (currentBannedLetters: string[]) => {
    // Count currently banned vowels
    const bannedVowelCount = currentBannedLetters.filter(letter => vowels.includes(letter)).length;
    const availableVowels = vowels.filter(v => !currentBannedLetters.includes(v));
    
    // If we have banned 3 vowels, we can only ban consonants
    if (bannedVowelCount >= 3) {
      const availableConsonants = consonants.filter(c => !currentBannedLetters.includes(c));
      return availableConsonants[Math.floor(Math.random() * availableConsonants.length)];
    }
    
    // Otherwise, randomly choose between consonant and vowel
    const shouldBanVowel = Math.random() < 0.2 && availableVowels.length > 2; // 20% chance to ban a vowel if we can
    if (shouldBanVowel) {
      return availableVowels[Math.floor(Math.random() * availableVowels.length)];
    } else {
      const availableConsonants = consonants.filter(c => !currentBannedLetters.includes(c));
      return availableConsonants[Math.floor(Math.random() * availableConsonants.length)];
    }
  };

  // Function to check for banned letters
  const checkBannedLetters = (word: string): string[] => {
    return gameState.bannedLetters.filter(letter => 
      word.toUpperCase().includes(letter)
    )
  }

  // Function to trigger flash animation
  const triggerFlash = () => {
    dispatch({ type: 'SET_FLASHING', payload: true });
    setTimeout(() => dispatch({ type: 'SET_FLASHING', payload: false }), 1000);
  };

  // Auto-scroll to bottom when words change
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth'
    })
  }, [gameState.words])

  // Fetch initial game state and words
  useEffect(() => {
    const fetchGameStateAndWords = async () => {
      if (!lobbyId) return;

      try {
        // Fetch game state
        const { data: gameState, error: stateError } = await supabase
          .from('game_state')
          .select('*')
          .eq('lobby_id', lobbyId)
          .maybeSingle();

        if (stateError) {
          console.error('Error fetching game state:', stateError);
          return;
        }

        if (gameState) {
          // Ensure we start with turn 0 if no words have been played
          const { count: wordCount } = await supabase
            .from('game_words')
            .select('id', { count: 'exact', head: true })
            .eq('lobby_id', lobbyId);

          const hasWords = (wordCount || 0) > 0;
          
          dispatch({
            type: 'UPDATE_GAME_STATE',
            payload: {
              currentTurn: gameState.current_turn,
              player1Time: gameState.player1_time,
              player2Time: gameState.player2_time,
              bannedLetters: gameState.banned_letters || [],
              player1Score: gameState.player1_score,
              player2Score: gameState.player2_score
            }
          });
        }

        // Fetch played words
        const { data: gameWords, error: wordsError } = await supabase
          .from('game_words')
          .select('*')
          .eq('lobby_id', lobbyId)
          .order('created_at', { ascending: true });

        if (wordsError) {
          console.error('Error fetching game words:', wordsError);
          return;
        }

        if (gameWords && gameState) {
          const wordCards: WordCard[] = gameWords.map((word: GameWord) => ({
            word: word.word,
            player: 'Unknown', // We'll update this after we have players
            timestamp: new Date(word.created_at).getTime(),
            isInvalid: !word.is_valid,
            score: word.score,
            scoreBreakdown: word.score_breakdown,
            dictionary: {
              partOfSpeech: word.part_of_speech,
              definition: word.definition,
              phonetics: word.phonetics
            }
          }));

          dispatch({
            type: 'INITIALIZE_STATE',
            payload: {
              gameState,
              words: wordCards,
              players: [] // Initialize with empty players array
            }
          });
        }
      } catch (error) {
        console.error('Error in fetchGameStateAndWords:', error);
      }
    };

    fetchGameStateAndWords();
  }, [lobbyId]); // Remove getInitialBannedLetters from dependencies

  // Fetch initial player data
  useEffect(() => {
    if (!lobbyId || !user) return;

    const fetchPlayers = async () => {
      try {
        console.log('Fetching initial player data for lobby:', lobbyId);
        
        // First get lobby members
        const { data: membersData, error: membersError } = await supabase
          .from('lobby_members')
          .select('user_id, joined_at')
          .eq('lobby_id', lobbyId)
          .order('joined_at', { ascending: true });

        if (membersError) {
          console.error('Error fetching lobby members:', membersError);
          return;
        }

        if (!membersData?.length) {
          console.log('No members found in lobby');
          return;
        }

        // Get profiles for all members
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, elo')
          .in('id', membersData.map(m => m.user_id));

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          return;
        }

        // Transform profiles into Player objects
        const playerProfiles = profilesData?.map((profile) => ({
          id: profile.id,
          name: profile.display_name,
          elo: profile.elo,
          score: 0,
          avatar_url: profile.avatar_url,
          originalElo: profile.elo,
          games_played: 0
        })) || [];

        dispatch({
          type: 'SET_PLAYERS',
          payload: playerProfiles
        });
        console.log('Initial players set:', playerProfiles);
      } catch (error) {
        console.error('Error in fetchPlayers:', error);
      }
    };

    fetchPlayers();
  }, [lobbyId, user]);

  // Set up presence and subscriptions separately
  useEffect(() => {
    if (!lobbyId || !user) return;

    let channel: ReturnType<typeof supabase.channel>;

    const setupPresenceAndSubscriptions = async () => {
      try {
        console.log('Setting up presence and subscriptions for lobby:', lobbyId);
        
        channel = supabase.channel(`game:${lobbyId}`, {
          config: {
            presence: {
              key: user.id
            }
          }
        });

        // Set up presence handlers
        channel
          .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            console.log('Presence sync:', state);
            const onlineIds = new Set(Object.keys(state));
            dispatch({ type: 'SET_ONLINE_PLAYERS', payload: onlineIds });
          })
          .on('presence', { event: 'join' }, ({ key }) => {
            console.log('Player joined:', key);
            dispatch({ 
              type: 'SET_ONLINE_PLAYERS', 
              payload: new Set([...gameState.onlinePlayers, key]) 
            });
          })
          .on('presence', { event: 'leave' }, ({ key }) => {
            console.log('Player left:', key);
            const newOnlinePlayers = new Set(gameState.onlinePlayers);
            newOnlinePlayers.delete(key);
            dispatch({ type: 'SET_ONLINE_PLAYERS', payload: newOnlinePlayers });
          });

        // Subscribe to game_words and game_state changes
        channel
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'game_words',
              filter: `lobby_id=eq.${lobbyId}`
            },
            async (payload: RealtimePostgresChangesPayload<GameWord>) => {
              const newWord = payload.new as GameWord;
              if (!newWord) return;

              // Use current gameState.players for name lookup
              dispatch({
                type: 'ADD_WORD',
                payload: {
                  word: newWord.word,
                  player: gameState.players.find(p => p.id === newWord.player_id)?.name || 'Unknown',
                  timestamp: Date.now(),
                  isInvalid: !newWord.is_valid,
                  score: newWord.score,
                  scoreBreakdown: newWord.score_breakdown,
                  dictionary: {
                    partOfSpeech: newWord.part_of_speech,
                    definition: newWord.definition,
                    phonetics: newWord.phonetics
                  }
                }
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'game_state',
              filter: `lobby_id=eq.${lobbyId}`
            },
            (payload: RealtimePostgresChangesPayload<GameState>) => {
              const newState = payload.new as GameState;
              if (!newState) return;

              dispatch({
                type: 'UPDATE_GAME_STATE',
                payload: {
                  currentTurn: newState.current_turn,
                  player1Time: newState.player1_time,
                  player2Time: newState.player2_time,
                  bannedLetters: newState.banned_letters || [],
                  player1Score: newState.player1_score,
                  player2Score: newState.player2_score
                }
              });
            }
          );

        await channel.subscribe();
        console.log('Channel subscribed');

        await channel.track({
          user_id: user.id,
          online_at: new Date().toISOString()
        });
        console.log('Presence tracked for user:', user.id);

      } catch (error) {
        console.error('Error in setupPresenceAndSubscriptions:', error);
      }
    };

    setupPresenceAndSubscriptions();

    return () => {
      if (channel) {
        console.log('Cleaning up subscriptions and presence...');
        channel.unsubscribe();
      }
    };
  }, [lobbyId, user]);

  // Basic word submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedWord = gameState.word.trim().toLowerCase();
    if (!trimmedWord || !gameState.players.length || !user) return;
    
    dispatch({ type: 'SET_WORD', payload: '' });

    const isPlayerOne = user.id === gameState.players[0]?.id;
    const isPlayerTwo = user.id === gameState.players[1]?.id;
    const isPlayersTurn = (gameState.currentTurn === 0 && isPlayerOne) || (gameState.currentTurn === 1 && isPlayerTwo);

    if (!isPlayersTurn) {
      showToast("It's not your turn!", 'error');
      return;
    }

    // Check for banned letters
    const foundBannedLetters = checkBannedLetters(trimmedWord);
    if (foundBannedLetters.length > 0) {
      dispatch({ type: 'SET_INVALID_LETTERS', payload: foundBannedLetters });
      triggerFlash();
      return;
    }
    dispatch({ type: 'SET_INVALID_LETTERS', payload: [] });

    try {
      // Check if word has been used before
      const { data: existingWords } = await supabase
        .from('game_words')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('word', trimmedWord);

      if (existingWords && existingWords.length > 0) {
        showToast('This word has already been used!', 'error');
        return;
      }

      // Validate word length
      if (trimmedWord.length < 5) {
        showToast('Word must be at least 5 letters long!', 'error');
        return;
      }

      // Validate word in dictionary
      const { data: dictWords, error: dictError } = await supabase
        .from('words')
        .select('part_of_speech, definitions')
        .eq('word', trimmedWord) as { 
          data: Array<{ part_of_speech: string; definitions: string[] }> | null; 
          error: Error | null; 
        };

      if (dictError) {
        console.error('Error checking dictionary:', dictError);
        showToast('Error validating word', 'error');
        return;
      }

      if (!dictWords || dictWords.length === 0) {
        showToast('Word not found in dictionary!', 'error');
        return;
      }

      // Use the first dictionary entry for the word record
      const validEntry = dictWords[0];

      // Calculate word score and breakdown
      const previousWord = gameState.words.length > 0 ? gameState.words[gameState.words.length - 1].word : null
      const levenDistance = previousWord ? calculateLevenshteinDistance(trimmedWord, previousWord) : 0
      
      // Calculate rarity bonus
      const rarityBonus = trimmedWord.toUpperCase().split('')
        .reduce((sum, letter) => {
          const frequency = SCORING_WEIGHTS.RARITY.LETTER_WEIGHTS[letter as Letter] || 5
          return sum + Math.pow(12 - frequency, SCORING_WEIGHTS.RARITY.EXPONENT)
        }, 0)

      // Calculate individual score components
      const lengthScore = Math.round(
        Math.pow(trimmedWord.length, SCORING_WEIGHTS.LENGTH.EXPONENT) * 
        SCORING_WEIGHTS.LENGTH.MULTIPLIER
      )

      let levenBonus = 0
      if (previousWord) {
        const maxPossibleDistance = Math.max(trimmedWord.length, previousWord.length)
        const normalizedLevenDistance = levenDistance / maxPossibleDistance
        levenBonus = Math.round(
          Math.exp(normalizedLevenDistance * SCORING_WEIGHTS.LEVENSHTEIN.EXPONENT) * 
          SCORING_WEIGHTS.LEVENSHTEIN.BASE_POINTS
        )
      }

      const rarityScore = Math.round(rarityBonus * SCORING_WEIGHTS.RARITY.MULTIPLIER)
      const totalScore = lengthScore + levenBonus + rarityScore

      // Insert the word first
      const { data: gameWords, error: wordError } = await supabase
        .from('game_words')
        .insert({
          lobby_id: lobbyId,
          word: trimmedWord,
          player_id: user.id,
          is_valid: true,
          score: totalScore,
          score_breakdown: {
            lengthScore,
            levenBonus,
            rarityBonus: rarityScore
          },
          part_of_speech: validEntry.part_of_speech,
          definition: validEntry.definitions[0]
        })
        .select();

      if (wordError || !gameWords || gameWords.length === 0) {
        console.error('Error inserting word:', wordError);
        showToast('Failed to submit word', 'error');
        return;
      }

      // Get the lobby config for time increment
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('lobbies')
        .select('game_config')
        .eq('id', lobbyId)
        .maybeSingle();

      if (lobbyError) {
        console.error('Error fetching lobby config:', lobbyError);
        showToast('Error updating game state', 'error');
        return;
      }

      const timeIncrement = lobbyData?.game_config.increment || 5000;

      // Update game state
      const { error: stateError } = await supabase
        .from('game_state')
        .update({
          current_turn: gameState.currentTurn === 0 ? 1 : 0,
          [isPlayerOne ? 'player1_score' : 'player2_score']: gameState.players[isPlayerOne ? 0 : 1].score + totalScore,
          [isPlayerOne ? 'player1_time' : 'player2_time']: (isPlayerOne ? gameState.player1Time : gameState.player2Time) + timeIncrement,
          banned_letters: (() => {
            // If this is the 5th word (index 4) or every 5th word after that
            if (gameState.words.length % 5 === 4 && gameState.bannedLetters.length < 18) {
              const nextBannedLetter = getNextBannedLetter(gameState.bannedLetters)
              return [...gameState.bannedLetters, nextBannedLetter]
            }
            return gameState.bannedLetters
          })(),
          last_move_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: user.id
        })
        .eq('lobby_id', lobbyId);

      if (stateError) {
        console.error('Error updating game state:', stateError);
        showToast('Error updating game state', 'error');
        return;
      }

    } catch (error) {
      console.error('Error submitting word:', error)
      showToast('Failed to submit word', 'error')
    }
  }

  // Compute online status in render instead of state
  const getPlayerOnlineStatus = (playerId: string) => gameState.onlinePlayers.has(playerId)

  // For now, keep the loading state return
  if (!user) {
    return (
      <PageTransition>
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-purple-500/50 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-white/70">Loading game...</p>
          </div>
        </main>
      </PageTransition>
    )
  }

  // Update the dispatch calls that reference removed actions
  const handleTimerEnd = () => {
    // Just navigate away without setting loading state
    router.push('/');
  };

  // Remove references to expandDirection
  const handleWordSubmit = (word: string) => {
    // Handle word submission without expandDirection
    dispatch({ type: 'SET_WORD', payload: word });
  };

  // Remove references to gameStarted
  const isGameActive = gameState.words.length > 0;

  // Update forfeit handler
  const handleForfeit = async () => {
    try {
      await supabase.from('game_state').update({
        status: 'finished',
        updated_by: user?.id
      }).eq('lobby_id', lobbyId);
      router.push('/');
    } catch (error) {
      console.error('Error forfeiting game:', error);
      showToast('Failed to forfeit game', 'error');
    }
  };

  return (
    <PageTransition>
      <main className="min-h-screen">
        {/* Game Over Modal */}
        <ActionModal
          isOpen={!!gameState.reportedWord}
          onClose={() => dispatch({ type: 'SET_REPORTED_WORD', payload: '' })}
          word={gameState.reportedWord || ''}
          mode="report"
        />

        <div className="h-screen flex">
          {/* Sidebar - Fixed */}
          <aside className="w-80 border-r border-white/20 shadow-[1px_0_0_0_rgba(255,255,255,0.1)] p-6 flex flex-col">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Words must be...
            </h2>

            {/* Parameters List */}
            <ul className="space-y-1.5 text-white">
              {parameters.map((param) => (
                <li key={param}>
                  <div className="bg-white/5 backdrop-blur-md rounded-lg px-3 py-2 text-sm border border-white/10 hover:bg-white/10 transition-colors text-center font-medium">
                    {param}
                  </div>
                </li>
              ))}
            </ul>

            {/* Letter Grid */}
            <div className="mt-auto relative">
              {/* Turn Indicator */}
              {user?.id === gameState.players[gameState.currentTurn]?.id && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <p className="text-lg font-medium text-white/80 animate-pulse">
                    Your turn!
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {/* First row (6 letters) */}
                <div className="grid grid-cols-7 gap-2 -translate-x-[calc(-1.25rem+1px)]">
                  {alphabet.slice(0, 6).map((letter) => (
                    <div
                      key={letter}
                      className={`
                        aspect-square rounded-xl flex items-center justify-center text-lg font-medium transition-all duration-200
                        ${gameState.bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${gameState.isFlashing && gameState.invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
                          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}
                      `}
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {alphabet.slice(6, 13).map((letter) => (
                    <div
                      key={letter}
                      className={`
                        aspect-square rounded-xl flex items-center justify-center text-lg font-medium transition-all duration-200
                        ${gameState.bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${gameState.isFlashing && gameState.invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
                          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}
                      `}
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {alphabet.slice(13, 20).map((letter) => (
                    <div
                      key={letter}
                      className={`
                        aspect-square rounded-xl flex items-center justify-center text-lg font-medium transition-all duration-200
                        ${gameState.bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${gameState.isFlashing && gameState.invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
                          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}
                      `}
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                {/* Last row (6 letters) */}
                <div className="grid grid-cols-7 gap-2 -translate-x-[calc(-1.25rem+1px)]">
                  {alphabet.slice(20).map((letter) => (
                    <div
                      key={letter}
                      className={`
                        aspect-square rounded-xl flex items-center justify-center text-lg font-medium transition-all duration-200
                        ${gameState.bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${gameState.isFlashing && gameState.invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
                          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}
                      `}
                    >
                      {letter}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 flex flex-col h-screen">
            {/* Word Chain - Scrollable */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">
              <div className="text-center mb-6">
              </div>
              <div className="flex flex-wrap items-start gap-y-4 justify-center w-full">
                {gameState.words.map((wordCard) => (
                  <div key={`${wordCard.word}-${wordCard.timestamp}`} className="flex items-center">
                    <div 
                      className="relative group overflow-visible" 
                    >
                      {/* Base Card */}
                      <div 
                        className={`
                          relative bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-lg overflow-visible
                          ${wordCard.isInvalid 
                            ? 'border-2 border-red-500/40 shadow-[0_0_10px_-3px_rgba(239,68,68,0.3)] bg-red-500/10' 
                            : wordCard.player !== gameState.players[0]?.name 
                              ? 'border-2 border-pink-500/40 shadow-[0_0_10px_-3px_rgba(236,72,153,0.3)]' 
                              : 'border-2 border-purple-500/40 shadow-[0_0_10px_-3px_rgba(168,85,247,0.3)]'
                          }
                        `}
                      >
                        {/* Word score tooltip */}
                        {wordCard.score && wordCard.score > 0 && !wordCard.isInvalid && (
                          <div className="absolute -right-2 -top-2 z-[150] overflow-visible">
                            <Tooltip
                              content={
                                <div className="w-52 space-y-2">
                                  <p className="font-medium text-base border-b border-white/20 pb-2">Score Breakdown</p>
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="text-white/70">Length bonus</span>
                                      <span className="font-medium">+{wordCard.scoreBreakdown?.lengthScore || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-white/70">Difference bonus</span>
                                      <span className="font-medium">+{wordCard.scoreBreakdown?.levenBonus || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-white/70">Rarity bonus</span>
                                      <span className="font-medium">+{wordCard.scoreBreakdown?.rarityBonus || 0}</span>
                                    </div>
                                  </div>
                                  <div className="border-t border-white/20 mt-2 pt-2 flex justify-between items-center">
                                    <span className="font-medium">Total Score</span>
                                    <span className="font-bold text-lg bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                                      +{wordCard.score}
                                    </span>
                                  </div>
                                </div>
                              }
                              className="z-[200]"
                            >
                              <p className="text-white/60 font-medium text-sm mr-3 mt-2">+{wordCard.score}</p>
                            </Tooltip>
                          </div>
                        )}
                        {wordCard.isInvalid ? (
                          <div className="flex items-center gap-2">
                            <X className="w-6 h-6 text-red-400" />
                            <p className="text-2xl font-medium text-white/60 line-through">{wordCard.word.toLowerCase()}</p>
                          </div>
                        ) : (
                          <p className="text-2xl font-medium text-white">{wordCard.word.toLowerCase()}</p>
                        )}
                      </div>

                      {/* Expandable Card */}
                      {!wordCard.isInvalid && (
                        <div 
                          className={`
                            absolute top-0 z-[100]
                            bg-white/20 backdrop-blur-xl rounded-2xl p-4 shadow-lg
                            transition-[width,opacity,grid-template-rows]
                            duration-150
                            group-hover:duration-200
                            ease-out
                            overflow-hidden
                            w-full
                            grid
                            opacity-0 pointer-events-none
                            group-hover:opacity-100 group-hover:pointer-events-auto
                            group-hover:w-[300px]
                            ${wordCard.player !== gameState.players[0]?.name 
                              ? 'border-2 border-pink-500/40 shadow-[0_0_10px_-3px_rgba(236,72,153,0.3)]' 
                              : 'border-2 border-purple-500/40 shadow-[0_0_10px_-3px_rgba(168,85,247,0.3)]'
                            }
                            after:absolute after:inset-0 after:bg-black/20 after:rounded-2xl
                          `}
                        >
                          <div className="relative z-10">
                            <p className="text-2xl font-medium text-white">{wordCard.word.toLowerCase()}</p>
                            {/* Report Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'SET_REPORTED_WORD', payload: wordCard.word })
                              }}
                              className="absolute top-0 right-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/90 transition-colors"
                              aria-label="Report word"
                            >
                              <Flag className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* Dictionary content */}
                          <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-100 group-hover:duration-200">
                            <div className="overflow-hidden min-w-0">
                              <div className="flex items-center gap-3 text-sm mt-2">
                                {wordCard.dictionary?.phonetics && (
                                  <p className="text-white/70 truncate">
                                    {wordCard.dictionary.phonetics}
                                  </p>
                                )}
                                {wordCard.dictionary?.partOfSpeech && (
                                  <p className="text-white/60 italic">
                                    {wordCard.dictionary.partOfSpeech}
                                  </p>
                                )}
                              </div>
                              {wordCard.dictionary?.definition && (
                                <p className="text-white/90 text-base mt-2">
                                  {wordCard.dictionary.definition}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {wordCard !== gameState.words[gameState.words.length - 1] && (
                      <div className="flex items-center mx-4">
                        <div className="w-4 h-px bg-white/20" />
                        <div className="w-2 h-2 rotate-45 border-t-2 border-r-2 border-white/20" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Panel - Fixed */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/5 to-black/10 pointer-events-none" />
              <div className="p-6 relative">
                <div className="flex items-end gap-4">
                  {/* Word Input */}
                  <div className="flex-1">
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
                      <form className="flex gap-4" onSubmit={handleSubmit}>
                        <input
                          type="text"
                          value={gameState.word}
                          onChange={(e) => {
                            dispatch({ type: 'SET_WORD', payload: e.target.value })
                            // Clear invalid letters when input changes
                            dispatch({ type: 'SET_INVALID_LETTERS', payload: [] })
                          }}
                          disabled={!user || !gameState.players.length || user.id !== gameState.players[gameState.currentTurn]?.id}
                          placeholder={
                            user?.id === gameState.players[gameState.currentTurn]?.id 
                            ? "Type your word..." 
                            : "Waiting for opponent..."
                          }
                          className={cn(`
                            flex-1 px-6 py-4 rounded-xl border bg-white/5 text-white 
                            placeholder:text-gray-400 focus:outline-none focus:ring-2 
                            focus:ring-purple-400 transition-all hover:border-white/40
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-white/20
                            `,
                            gameState.invalidLetters.length > 0 
                              ? 'border-red-500/50 focus:ring-red-400' 
                              : 'border-white/20'
                          )}
                        />
                        <button
                          type="submit"
                          disabled={!user || !gameState.players.length || user.id !== gameState.players[gameState.currentTurn]?.id}
                          className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow-lg transition-all duration-200 
                          hover:shadow-xl hover:scale-105 hover:from-purple-600 hover:to-pink-600 
                          active:scale-95 active:shadow-md active:translate-y-0.5
                          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg disabled:hover:translate-y-0
                          disabled:from-gray-500 disabled:to-gray-600"
                          aria-label="Submit word"
                        >
                          <Send className="w-6 h-6" />
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Player Profiles */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      {/* Score Display */}
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                        <AnimatedScore value={gameState.players[0]?.score || 0} />
                      </div>
                      <Tooltip 
                        content={
                          <div className="flex flex-col items-center text-center">
                            <span>{gameState.players[0]?.name || 'Unknown Player'}</span>
                            <span className="text-white/60 text-sm">
                              {gameState.players[0]?.elo || '1000'}
                            </span>
                          </div>
                        }
                      >
                        <div className="rounded-full relative">
                          <Avatar
                            src={gameState.players[0]?.avatar_url}
                            name={gameState.players[0]?.name || '?'}
                            size="xl"
                            className={cn(
                              'ring-4 transition-all duration-300',
                              gameState.currentTurn === 0
                                ? 'ring-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                : 'ring-white/20',
                              getPlayerOnlineStatus(gameState.players[0]?.id) === false && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={gameState.player1Time} 
                              isActive={isGameActive && gameState.currentTurn === 0} 
                            />
                          </div>
                          {getPlayerOnlineStatus(gameState.players[0]?.id) === false && (
                            <div className="absolute -bottom-1 -right-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20 z-10">
                              <div className="w-3 h-3 rounded-full bg-red-500/50 animate-pulse" />
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    </div>
                    
                    <span className="text-white/40 text-2xl font-light">VS</span>
                    
                    <div className="relative">
                      {/* Score Display */}
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                        <AnimatedScore value={gameState.players[1]?.score || 0} />
                      </div>
                      <Tooltip 
                        content={
                          <div className="flex flex-col items-center text-center">
                            <span>{gameState.players[1]?.name || 'Unknown Player'}</span>
                            <span className="text-white/60 text-sm">
                              {gameState.players[1]?.elo || '1000'}
                            </span>
                          </div>
                        }
                      >
                        <div className="rounded-full relative">
                          <Avatar
                            src={gameState.players[1]?.avatar_url}
                            name={gameState.players[1]?.name || '?'}
                            size="xl"
                            className={cn(
                              'ring-4 transition-all duration-300',
                              gameState.currentTurn === 1
                                ? 'ring-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                : 'ring-white/20',
                              getPlayerOnlineStatus(gameState.players[1]?.id) === false && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={gameState.player2Time} 
                              isActive={isGameActive && gameState.currentTurn === 1} 
                            />
                          </div>
                          {getPlayerOnlineStatus(gameState.players[1]?.id) === false && (
                            <div className="absolute -bottom-1 -right-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20 z-10">
                              <div className="w-3 h-3 rounded-full bg-red-500/50 animate-pulse" />
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </PageTransition>
  )
} 