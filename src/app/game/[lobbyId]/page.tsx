'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { use } from 'react'
import { Send, X, Flag } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { ActionModal } from '@/components/game/ActionModal'
import { PageTransition } from '@/components/layout/PageTransition'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { Avatar } from '@/components/ui/Avatar'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils/cn'
import { RealtimeChannel } from '@supabase/supabase-js'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { calculateLevenshteinDistance, scoreWord, SCORING_WEIGHTS } from '@/lib/utils/word-scoring'
import { AnimatedScore } from '@/components/game/AnimatedScore'
import { Timer } from '@/components/game/Timer'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'

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
  elo: number
  score: number
  avatar_url?: string | null
  originalElo?: number
}

interface GameState {
  lobby_id: string
  current_turn: number
  player1_score: number
  player2_score: number
  player1_time: number
  player2_time: number
  updated_at: string
  updated_by?: string
  status: 'active' | 'paused' | 'finished'
  last_move_at: string
  game_started_at: string
}

interface PlayerPresence {
  user_id: string;
  status: 'online' | 'offline';
  last_seen: string;
  lobby_id: string;
}

type PresencePayload = RealtimePostgresChangesPayload<{
  user_id: string;
  status: 'online' | 'offline';
  last_seen: string;
}>;

interface GamePageProps {
  params: Promise<{
    lobbyId: string
  }>
}

// Scoring weights - can be adjusted to taste
const SCORING_CONFIG = {
  letterRarityWeights: SCORING_WEIGHTS.RARITY.LETTER_WEIGHTS
} as const

type LetterRarity = typeof SCORING_CONFIG.letterRarityWeights
type Letter = keyof LetterRarity

// Add these constants at the top of the file, after imports
const STORAGE_KEY_PREFIX = 'wordsduel_timer_' // Prefix for localStorage keys

// Update type guard to handle the realtime payload
function isPlayerPresence(obj: unknown): obj is PlayerPresence {
  return obj !== null &&
    typeof obj === 'object' &&
    'user_id' in obj &&
    'status' in obj &&
    'last_seen' in obj &&
    'lobby_id' in obj &&
    ((obj as PlayerPresence).status === 'online' || (obj as PlayerPresence).status === 'offline');
}

export default function GamePage({ params }: GamePageProps) {
  const { lobbyId } = use(params)
  const { user } = useAuth()
  const { showToast } = useToast()
  const [word, setWord] = useState('')
  const [words, setWords] = useState<WordCard[]>([])
  const [invalidLetters, setInvalidLetters] = useState<string[]>([])
  const [isFlashing, setIsFlashing] = useState(false)
  const [reportedWord, setReportedWord] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true)
  const [currentTurn, setCurrentTurn] = useState<number>(0)
  const [gameStarted, setGameStarted] = useState(false)
  const [player1Time, setPlayer1Time] = useState(0)
  const [player2Time, setPlayer2Time] = useState(0)
  const [isLoadingGame, setIsLoadingGame] = useState(true)
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [gameOverInfo, setGameOverInfo] = useState<{
    winner: Player | null
    loser: Player | null
    reason: 'time' | 'forfeit'
  } | null>(null)
  const [gameConfig, setGameConfig] = useState<{
    base_time: number
    increment: number
  }>({ base_time: 3 * 60 * 1000, increment: 5 * 1000 })
  
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [expandDirection, setExpandDirection] = useState<'left' | 'right'>('right')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const playersRef = useRef<Player[]>([])
  const currentTurnRef = useRef<number>(0)
  const player1TimeRef = useRef<number>(0)
  const player2TimeRef = useRef<number>(0)
  const hasProcessedGameEnd = useRef<boolean>(false)
  const router = useRouter()

  // Add timerState to component state
  const [timerState, setTimerState] = useState<{
    last_tick: number;
    is_paused: boolean;
  }>({ last_tick: Date.now(), is_paused: false });

  const [playerPresence, setPlayerPresence] = useState<PlayerPresence[]>([]);

  // Update refs when state changes
  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    currentTurnRef.current = currentTurn
  }, [currentTurn])

  useEffect(() => {
    player1TimeRef.current = player1Time
  }, [player1Time])

  useEffect(() => {
    player2TimeRef.current = player2Time
  }, [player2Time])

  // Auto-scroll to bottom when words change
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth'
    })

    return () => {
      // Cleanup if needed
    }
  }, [words])

  // Function to check if element is near right edge
  const updateExpandDirection = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current
    if (!container) return
    
    const rect = (event.target as HTMLElement).getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const spaceOnRight = containerRect.right - rect.right
    
    setExpandDirection(spaceOnRight < 310 ? 'left' : 'right')
  }

  // Simulated data
  const parameters = [
    'at least 5 letters long',
    'a singular non-proper noun, adjective, adverb, or infinitive verb'
  ]
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const bannedLetters: string[] = []

  // Fetch lobby configuration and initialize game state
  const initializeGameState = useCallback(async () => {
    if (!user) return;

    try {
      // First get the lobby configuration
      const { data: lobby, error: lobbyError } = await supabase
        .from('lobbies')
        .select('game_config')
        .eq('id', lobbyId)
        .single()

      if (lobbyError) throw lobbyError

      if (lobby?.game_config) {
        setGameConfig(lobby.game_config)
        // Initialize timers with the base time from config
        setPlayer1Time(lobby.game_config.base_time)
        setPlayer2Time(lobby.game_config.base_time)
      }

      // Initialize game state
      const { error } = await supabase.rpc('initialize_game_state', {
        p_lobby_id: lobbyId,
        p_user_id: user.id,
        p_base_time: lobby?.game_config?.base_time || 3 * 60 * 1000
      });

      if (error) {
        console.error('Error initializing game state:', error);
        showToast('Error initializing game', 'error');
      }
    } catch (error) {
      console.error('Error initializing game state:', error);
      showToast('Error initializing game', 'error');
    }
  }, [user, lobbyId, showToast]);

  // Fetch lobby members and their profiles
  useEffect(() => {
    if (!user) return

    const fetchLobbyMembers = async () => {
      setIsLoadingPlayers(true)
      try {
        // First get the lobby info to determine host
        const { data: lobby, error: lobbyError } = await supabase
          .from('lobbies')
          .select('host_id')
          .eq('id', lobbyId)
          .single()

        if (lobbyError) throw lobbyError

        // Then get the lobby members
        const { data: members, error: membersError } = await supabase
          .from('lobby_members')
          .select('user_id')
          .eq('lobby_id', lobbyId)

        if (membersError) throw membersError

        if (!members?.length) {
          setIsLoadingPlayers(false)
          return
        }

        // Then get their profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, elo')
          .in('id', members.map(m => m.user_id))

        if (profilesError) throw profilesError

        if (profiles) {
          // Sort profiles to ensure host is always player 1
          const sortedProfiles = profiles.sort((a, b) => {
            if (a.id === lobby.host_id) return -1
            if (b.id === lobby.host_id) return 1
            return 0
          })

          const formattedPlayers: Player[] = sortedProfiles.map(profile => ({
            id: profile.id,
            name: profile.display_name,
            elo: profile.elo || 1200,
            score: 0,
            avatar_url: profile.avatar_url
          }))
          setPlayers(formattedPlayers)
          // Initialize game state after setting players
          await initializeGameState()
        }
      } catch (error) {
        console.error('Error fetching players:', error)
        showToast('Error loading players', 'error')
      }
      setIsLoadingPlayers(false)
    }

    fetchLobbyMembers()
  }, [user, lobbyId, showToast, initializeGameState])

  // Function to check for banned letters
  const checkBannedLetters = (word: string): string[] => {
    return bannedLetters.filter(letter => 
      word.toUpperCase().includes(letter)
    )
  }

  // Function to trigger flash animation
  const triggerFlash = () => {
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 1000) // Reset after 1 second
  }

  // Verify lobby membership
  useEffect(() => {
    if (!user) return

    const checkLobbyMembership = async () => {
      const { data, error } = await supabase
        .from('lobby_members')
        .select('*')
        .eq('lobby_id', lobbyId)
        .eq('user_id', user.id)

      if (error) {
        showToast('Error checking lobby membership', 'error')
        window.location.href = '/lobbies'
        return
      }

      if (!data || data.length === 0) {
        showToast('You are not a member of this lobby', 'error')
        window.location.href = '/lobbies'
        return
      }
    }

    checkLobbyMembership()
  }, [user, lobbyId, showToast])

  // Subscribe to game updates
  useEffect(() => {
    if (!lobbyId || !user) return

    console.log('Setting up realtime subscription')

    channelRef.current = supabase
      .channel(`game:${lobbyId}`)
      // Add subscription to lobbies table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies',
          filter: `id=eq.${lobbyId}`
        },
        (payload: RealtimePostgresChangesPayload<{ id: string }>) => {
          // If the lobby was deleted, redirect to lobbies page
          if (payload.eventType === 'DELETE') {
            showToast('Lobby no longer exists', 'info');
            router.push('/lobbies');
            return;
          }
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
        async (payload) => {
          if (!payload.new) return

          const newState = payload.new as GameState
          
          // Update all game state at once
          setCurrentTurn(newState.current_turn)
          setPlayer1Time(newState.player1_time)
          setPlayer2Time(newState.player2_time)
          setPlayers(prev => {
            const updated = [...prev]
            if (updated[0]) updated[0].score = newState.player1_score
            if (updated[1]) updated[1].score = newState.player2_score
            return updated
          })

          // Handle game end
          if (newState.status === 'finished' && !hasProcessedGameEnd.current && !showGameOverModal) {
            hasProcessedGameEnd.current = true;
            const currentPlayers = playersRef.current;

            if (currentPlayers.length >= 2) {
              const winner = newState.player1_time <= 0 ? currentPlayers[1] : currentPlayers[0];
              const loser = newState.player1_time <= 0 ? currentPlayers[0] : currentPlayers[1];
              
              // Store original ELO values
              const originalWinnerElo = winner.elo;
              const originalLoserElo = loser.elo;

              // Call calculate_and_update_elo RPC function
              const { error: eloError } = await supabase.rpc('calculate_and_update_elo', {
                p_end_reason: 'time',
                p_lobby_id: lobbyId,
                p_loser_id: loser.id,
                p_loser_score: newState.player1_time <= 0 ? newState.player1_score : newState.player2_score,
                p_winner_id: winner.id,
                p_winner_score: newState.player1_time <= 0 ? newState.player2_score : newState.player1_score
              });

              if (eloError) {
                console.error('Error updating player ratings:', eloError);
                showToast('Error updating player ratings', 'error');
                return;
              }

              // Always fetch the updated profiles to show the latest ELO ratings
              const { data: updatedProfiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url, elo, games_played')
                .in('id', [winner.id, loser.id]);

              if (profilesError) {
                console.error('Error fetching updated profiles:', profilesError);
                return;
              }

              if (updatedProfiles) {
                const updatedWinner = updatedProfiles.find(p => p.id === winner.id);
                const updatedLoser = updatedProfiles.find(p => p.id === loser.id);

                if (!updatedWinner || !updatedLoser) {
                  console.error('Could not find updated profiles for both players');
                  return;
                }

                // Update the game over info with new ratings and original ratings for change calculation
                setGameOverInfo({
                  winner: { 
                    ...winner,
                    elo: updatedWinner.elo,
                    originalElo: originalWinnerElo
                  },
                  loser: { 
                    ...loser,
                    elo: updatedLoser.elo,
                    originalElo: originalLoserElo
                  },
                  reason: 'time'
                });

                // Update players state to reflect new ratings
                setPlayers(prev => {
                  const updated = [...prev];
                  const winnerIndex = updated.findIndex(p => p.id === winner.id);
                  const loserIndex = updated.findIndex(p => p.id === loser.id);
                  if (winnerIndex !== -1) updated[winnerIndex].elo = updatedWinner.elo;
                  if (loserIndex !== -1) updated[loserIndex].elo = updatedLoser.elo;
                  return updated;
                });

                // Show the game over modal
                setShowGameOverModal(true);
              }
            }
          }

          // Reset animation frame timer
          setTimerState(prev => ({ ...prev, last_tick: Date.now() }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_words',
          filter: `lobby_id=eq.${lobbyId}`
        },
        async (payload) => {
          if (!payload.new) return

          try {
            // Get the complete word data
            const { data: completeWord, error: wordError } = await supabase
              .from('game_words')
              .select('*')
              .eq('id', payload.new.id)
              .single()

            if (wordError) throw wordError

            if (!completeWord) {
              console.log('No complete word data found')
              return
            }

            // Get the player's display name
            const { data: playerProfile, error: profileError } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', completeWord.player_id)
              .single()

            if (profileError) {
              console.error('Error fetching player profile:', profileError)
            }

            // Add word to the list
            setWords(prev => {
              if (prev.some(w => w.word === completeWord.word)) {
                console.log('Word already in list, skipping')
                return prev
              }

              const newWord: WordCard = {
                word: completeWord.word,
                player: playerProfile?.display_name || 'Unknown',
                timestamp: Date.parse(completeWord.created_at),
                isInvalid: !completeWord.is_valid,
                score: completeWord.score,
                scoreBreakdown: completeWord.score_breakdown,
                dictionary: {
                  partOfSpeech: completeWord.part_of_speech,
                  definition: completeWord.definition,
                  phonetics: completeWord.phonetics
                }
              }

              return [...prev, newWord]
            })

            // Process move if it's valid
            if (completeWord.is_valid) {
              await processMove(completeWord)
            }
          } catch (error) {
            console.error('Error processing word update:', error)
          }
        }
      )
      .subscribe()

    return () => {
      console.log('Cleaning up subscription')
      channelRef.current?.unsubscribe()
    }
  }, [lobbyId, user, showToast]) // Added showToast to dependency array

  // Check if game has started (any valid words played)
  useEffect(() => {
    const hasValidWords = words.some(w => !w.isInvalid)
    setGameStarted(hasValidWords)
  }, [words])

  // Replace the existing timer effect with this server-driven version
  useEffect(() => {
    if (!user || !lobbyId || players.length < 2 || !gameStarted) return;

    // Set up interval to fetch the latest game state
    const interval = setInterval(async () => {
      if (user?.id === players[currentTurn]?.id) {
        const now = Date.now();
        const { data: gameState, error } = await supabase
          .from('game_state')
          .select('player1_time, player2_time, last_move_at')
          .eq('lobby_id', lobbyId)
          .single();

        if (error) {
          console.error('Error fetching game state:', error);
          return;
        }

        if (gameState) {
          const timeSinceLastUpdate = now - Date.parse(gameState.last_move_at);
          const currentPlayerTime = currentTurn === 0 ? gameState.player1_time : gameState.player2_time;
          const newTime = Math.max(0, currentPlayerTime - timeSinceLastUpdate);

          // Update the server with the new time
          const { error: updateError } = await supabase
            .from('game_state')
            .update({
              [currentTurn === 0 ? 'player1_time' : 'player2_time']: Math.round(newTime),
              last_move_at: new Date().toISOString(),
              status: newTime <= 0 ? 'finished' : 'active'
            })
            .eq('lobby_id', lobbyId);

          if (updateError) {
            console.error('Error updating game state:', updateError);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user, lobbyId, players, gameStarted, currentTurn]);

  // Function to fetch initial game state
  const fetchGameState = useCallback(async () => {
    if (!user || !lobbyId) return

    try {
      // Only set loading state on initial load
      if (isInitialLoad) {
        setIsLoadingGame(true)
      }

      // First fetch all words for this lobby
      const { data: gameWords, error: wordsError } = await supabase
        .from('game_words')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('created_at', { ascending: true })

      if (wordsError) throw wordsError

      if (gameWords) {
        // Get all unique player IDs from the words
        const playerIds = [...new Set(gameWords.map(word => word.player_id))]
        
        // Fetch player profiles in a separate query
        const { data: playerProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', playerIds)

        if (profilesError) throw profilesError

        // Create a map of player IDs to display names
        const playerNames = new Map(
          playerProfiles?.map(profile => [profile.id, profile.display_name]) || []
        )

        const processedWords: WordCard[] = gameWords.map(word => ({
            word: word.word,
          player: playerNames.get(word.player_id) || 'Unknown',
            timestamp: Date.parse(word.created_at),
            isInvalid: !word.is_valid,
            score: word.score,
            scoreBreakdown: word.score_breakdown,
            dictionary: {
              partOfSpeech: word.part_of_speech,
              definition: word.definition,
              phonetics: word.phonetics
            }
        }))

        setWords(processedWords)
        
        // Get the current game state instead of calculating turn
        const { data: gameState, error: gameStateError } = await supabase
          .from('game_state')
          .select('current_turn')
          .eq('lobby_id', lobbyId)
          .single()

        if (!gameStateError && gameState) {
          setCurrentTurn(gameState.current_turn)
        }
      }
    } catch (error) {
      console.error('Error fetching game state:', error)
    } finally {
      if (isInitialLoad) {
        setIsLoadingGame(false)
        setIsInitialLoad(false)
      }
    }
  }, [user, lobbyId, isInitialLoad])

  // Fetch initial game state after players are loaded
  useEffect(() => {
    if (!isLoadingPlayers && players.length > 0) {
      fetchGameState()
    }
  }, [isLoadingPlayers, players.length, fetchGameState])

  // Update the process_game_move call to include increment
  const processMove = async (completeWord: any) => {
    if (!completeWord.is_valid) return;

    const { error: processError } = await supabase.rpc('process_game_move', {
      p_lobby_id: lobbyId,
      p_player_id: completeWord.player_id,
      p_word: completeWord.word,
      p_score: completeWord.score || 0,
      p_is_valid: true,
      p_increment: gameConfig.increment
    })

    if (processError) {
      console.error('Error processing move:', processError)
      showToast('Error processing move', 'error')
    }
  }

  // Update the word submission handler to use processMove
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedWord = word.trim().toLowerCase()
    if (!trimmedWord || !players.length || !user) return
    
    setWord('')

    const isPlayerOne = user.id === players[0]?.id
    const isPlayerTwo = user.id === players[1]?.id
    const isPlayersTurn = (currentTurn === 0 && isPlayerOne) || (currentTurn === 1 && isPlayerTwo)

    if (!isPlayersTurn) {
      showToast("It's not your turn!", 'error')
      return
    }

    // Check for banned letters
    const foundBannedLetters = checkBannedLetters(trimmedWord)
    if (foundBannedLetters.length > 0) {
      setInvalidLetters(foundBannedLetters)
      triggerFlash()
      return
    }
    setInvalidLetters([])

    try {
      // First check if word has already been played in this lobby
      const { data: existingWords, error: existingWordError } = await supabase
        .from('game_words')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('word', trimmedWord)

      if (existingWordError) {
        console.error('Error checking existing word:', existingWordError)
        showToast('Error checking word', 'error')
        return
      }

      if (existingWords && existingWords.length > 0) {
        showToast('This word has already been played!', 'error')
        return
      }

      // Check if word exists in dictionary
      const { data: dictData, error: dictError } = await supabase
        .from('words')
        .select('part_of_speech, definitions, phonetics')
        .eq('word', trimmedWord)

      if (dictError) {
        console.error('Error checking dictionary:', dictError)
        showToast('Error checking word', 'error')
        return
      }

      // Word is valid if we have any matching entries
      const isValid = dictData && dictData.length > 0
      const firstEntry = dictData?.[0]

      // Calculate word score if valid
      let wordScore = undefined
      let scoreBreakdown = undefined
      if (isValid) {
        // Get the last valid word for Levenshtein distance calculation
        const lastValidWord = words.filter(w => !w.isInvalid).pop()?.word || null
        wordScore = scoreWord(trimmedWord, lastValidWord)
        
        if (lastValidWord) {
          const levenDistance = calculateLevenshteinDistance(trimmedWord, lastValidWord)
          const maxPossibleDistance = Math.max(trimmedWord.length, lastValidWord.length)
          const normalizedLevenDistance = levenDistance / maxPossibleDistance
          
          // Calculate rarity bonus with exponential scaling
          const rarityBonus = trimmedWord.toUpperCase().split('')
            .reduce((sum, letter) => {
              const frequency = SCORING_CONFIG.letterRarityWeights[letter as Letter] || 5
              // Apply exponential scaling to the rarity value
              return sum + Math.pow(12 - frequency, SCORING_WEIGHTS.RARITY.EXPONENT)
            }, 0)

          // Calculate breakdown components using the same weights as scoreWord
          scoreBreakdown = {
            lengthScore: Math.round(Math.pow(trimmedWord.length, SCORING_WEIGHTS.LENGTH.EXPONENT) * SCORING_WEIGHTS.LENGTH.MULTIPLIER),
            levenBonus: Math.round(Math.exp(normalizedLevenDistance * SCORING_WEIGHTS.LEVENSHTEIN.EXPONENT) * SCORING_WEIGHTS.LEVENSHTEIN.BASE_POINTS),
            rarityBonus: Math.round(rarityBonus * SCORING_WEIGHTS.RARITY.MULTIPLIER)
          }
        } else {
          // First word - no Levenshtein bonus
          // Calculate rarity bonus with exponential scaling
          const rarityBonus = trimmedWord.toUpperCase().split('')
            .reduce((sum, letter) => {
              const frequency = SCORING_CONFIG.letterRarityWeights[letter as Letter] || 5
              // Apply exponential scaling to the rarity value
              return sum + Math.pow(12 - frequency, SCORING_WEIGHTS.RARITY.EXPONENT)
            }, 0)

          scoreBreakdown = {
            lengthScore: Math.round(Math.pow(trimmedWord.length, SCORING_WEIGHTS.LENGTH.EXPONENT) * SCORING_WEIGHTS.LENGTH.MULTIPLIER),
            levenBonus: 0,
            rarityBonus: Math.round(rarityBonus * SCORING_WEIGHTS.RARITY.MULTIPLIER)
          }
        }
      }

      // Insert word into game_words
      const { data: insertedWord, error: insertError } = await supabase
        .from('game_words')
        .insert({
          lobby_id: lobbyId,
          word: trimmedWord,
          player_id: user.id,
          is_valid: isValid,
          score: wordScore,
          score_breakdown: scoreBreakdown,
          part_of_speech: firstEntry?.part_of_speech,
          definition: firstEntry?.definitions?.[0],
          phonetics: firstEntry?.phonetics
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error inserting word:', insertError)
        showToast('Error submitting word', 'error')
        return
      }

      if (insertedWord) {
        await processMove(insertedWord)
      }
    } catch (error) {
      console.error('Error submitting word:', error)
      showToast('Error submitting word', 'error')
    }
  }

  // Add presence tracking effect
  useEffect(() => {
    if (!user || !lobbyId) return;

    // Set up interval to update presence
    const presenceInterval = setInterval(async () => {
      try {
        await supabase.from('game_presence').upsert({
          lobby_id: lobbyId,
          user_id: user.id,
          last_seen: new Date().toISOString(),
          status: 'online'
        });
      } catch (error) {
        console.error('Error updating presence:', error);
      }
    }, 3000);

    // Subscribe to presence changes
    const presenceChannel = supabase.channel(`presence:${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_presence',
          filter: `lobby_id=eq.${lobbyId}`
        },
        async (payload: RealtimePostgresChangesPayload<PlayerPresence>) => {
          console.log('Presence change detected:', payload);
          
          // Handle DELETE event or offline status
          if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && payload.new?.status === 'offline')) {
            const userId = (payload.old as PlayerPresence)?.user_id || (payload.new as PlayerPresence)?.user_id;
            if (!userId) {
              console.log('No user_id in presence payload');
              return;
            }
            
            console.log('Player disconnected, calling handle_player_disconnect');
            try {
              // Log the parameters we're about to send
              console.log('Disconnect params:', { lobbyId, userId });
              
              const { error } = await supabase.rpc('handle_player_disconnect', {
                p_lobby_id: lobbyId,
                p_user_id: userId
              });
              
              if (error) {
                console.error('handle_player_disconnect error:', error);
                showToast('Error handling disconnect', 'error');
              }
            } catch (error) {
              console.error('Error in handle_player_disconnect:', error);
              showToast('Error handling disconnect', 'error');
            }
            return;
          }
          
          // Only update presence state if not a disconnect event
          const newPresence = payload.new;
          if (newPresence && isPlayerPresence(newPresence)) {
            setPlayerPresence(prev => {
              const updated = [...prev];
              const index = updated.findIndex(p => p.user_id === newPresence.user_id);
              if (index !== -1) {
                updated[index] = newPresence;
              } else {
                updated.push(newPresence);
              }
              return updated;
            });
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      clearInterval(presenceInterval);
      presenceChannel.unsubscribe();
      // Set status to offline
      void supabase.from('game_presence').update({ status: 'offline' })
        .eq('lobby_id', lobbyId)
        .eq('user_id', user.id);
    };
  }, [user, lobbyId, showToast, router]);

  // Helper function to check if a player is online
  const isPlayerOnline = (playerId: string) => {
    const presence = playerPresence.find(p => p.user_id === playerId);
    return presence?.status === 'online';
  };

  return (
    <PageTransition>
      <main className="min-h-screen">
        {/* Game Over Modal */}
        <ActionModal
          isOpen={showGameOverModal}
          onClose={() => {
            setShowGameOverModal(false);
            setGameOverInfo(null);
            router.push('/');
          }}
          word=""
          mode="info"
          title=""
          customButtons={
            <Button
              onClick={() => router.push('/')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 w-full"
            >
              Return Home
            </Button>
          }
        >
          {gameOverInfo && (
            <div className="space-y-8">
              {/* Victory/Defeat Banner */}
              {user?.id === gameOverInfo.winner?.id ? (
                <div className="text-center">
                  <h3 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Victory!
                  </h3>
                </div>
              ) : user?.id === gameOverInfo.loser?.id ? (
                <div className="text-center">
                  <h3 className="text-4xl font-bold text-white/80">
                    Defeat
                  </h3>
                </div>
              ) : null}

              {/* Players */}
              <div className="grid grid-cols-2 gap-4">
                {/* Winner */}
                <div className="flex flex-col items-center gap-3 p-4 bg-white/10 rounded-xl border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
                  <Avatar
                    src={gameOverInfo.winner?.avatar_url}
                    name={gameOverInfo.winner?.name || '?'}
                    size="lg"
                    className="ring-2 ring-purple-500/50"
                  />
                  <div className="text-center space-y-1">
                    <p className="font-medium text-white/90">{gameOverInfo.winner?.name}</p>
                    <p className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                      {gameOverInfo.winner?.score || 0}
                    </p>
                    <p className="text-sm space-x-1">
                      <span className="text-white/60">{gameOverInfo.winner?.elo}</span>
                      <span className="text-green-400">
                        (+{(gameOverInfo.winner?.elo || 0) - (gameOverInfo.winner?.originalElo || 0)})
                      </span>
                    </p>
                  </div>
                </div>

                {/* Loser */}
                <div className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
                  <Avatar
                    src={gameOverInfo.loser?.avatar_url}
                    name={gameOverInfo.loser?.name || '?'}
                    size="lg"
                    className="ring-2 ring-white/20"
                  />
                  <div className="text-center space-y-1">
                    <p className="font-medium text-white/90">{gameOverInfo.loser?.name}</p>
                    <p className="text-2xl font-bold text-white/60">
                      {gameOverInfo.loser?.score || 0}
                    </p>
                    <p className="text-sm space-x-1">
                      <span className="text-white/60">{gameOverInfo.loser?.elo}</span>
                      <span className="text-red-400">
                        ({(gameOverInfo.loser?.elo || 0) - (gameOverInfo.loser?.originalElo || 0)})
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Game End Reason */}
              <div className="text-center text-sm text-white/60">
                Game ended due to {gameOverInfo.reason === 'time' ? 'time expiration' : 'forfeit'}
              </div>
            </div>
          )}
        </ActionModal>

        {/* Report Modal */}
        <ActionModal
          isOpen={!!reportedWord}
          onClose={() => setReportedWord('')}
          word={reportedWord || ''}
          mode="report"
        />

        <div className="h-screen flex">
          {/* Loading overlay - Only show on initial load */}
          {isInitialLoad && (isLoadingPlayers || isLoadingGame) && (
            <div className="absolute inset-0 backdrop-blur-sm z-50 flex items-center justify-center bg-white/5">
              <div className="text-white text-xl font-medium bg-white/10 px-6 py-3 rounded-xl backdrop-blur-md border border-white/10">
                {isLoadingPlayers ? 'Loading players...' : 'Loading game state...'}
              </div>
            </div>
          )}

          {/* Sidebar - Fixed */}
          <aside className="w-80 border-r border-white/20 shadow-[1px_0_0_0_rgba(255,255,255,0.1)] p-6 flex flex-col">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Words must be...
            </h2>

            {/* Parameters List */}
            <ul className="space-y-1.5 text-white">
              {parameters.map((param, index) => (
                <li key={index}>
                  <div className="bg-white/5 backdrop-blur-md rounded-lg px-3 py-2 text-sm border border-white/10 hover:bg-white/10 transition-colors text-center font-medium">
                    {param}
                  </div>
                </li>
              ))}
            </ul>

            {/* Letter Grid */}
            <div className="mt-auto relative">
              {/* Turn Indicator */}
              {user?.id === players[currentTurn]?.id && (
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
                        ${bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${isFlashing && invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
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
                        ${bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${isFlashing && invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
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
                        ${bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${isFlashing && invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
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
                        ${bannedLetters.includes(letter)
                          ? `bg-red-500/25 text-red-200 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]
                             ${isFlashing && invalidLetters.includes(letter) ? 'animate-[flash_1s_ease-in-out]' : ''}`
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
                {words.map((wordCard) => (
                  <div key={`${wordCard.word}-${wordCard.timestamp}`} className="flex items-center">
                    <div 
                      className="relative group overflow-visible" 
                      onMouseEnter={updateExpandDirection}
                    >
                      {/* Base Card */}
                      <div 
                        className={`
                          relative bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-lg overflow-visible
                          ${wordCard.isInvalid 
                            ? 'border-2 border-red-500/40 shadow-[0_0_10px_-3px_rgba(239,68,68,0.3)] bg-red-500/10' 
                            : wordCard.player !== players[0]?.name 
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
                            ${expandDirection === 'left' ? 'right-0' : 'left-0'}
                            ${wordCard.player !== players[0]?.name 
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
                              onClick={() => setReportedWord(wordCard.word)}
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

                    {wordCard !== words[words.length - 1] && (
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
                          value={word}
                          onChange={(e) => {
                            setWord(e.target.value)
                            // Clear invalid letters when input changes
                            setInvalidLetters([])
                          }}
                          disabled={!user || !players.length || user.id !== players[currentTurn]?.id || isLoadingGame}
                          placeholder={
                            isLoadingGame 
                              ? "Loading game..." 
                              : user?.id === players[currentTurn]?.id 
                            ? "Type your word..." 
                                : "Waiting for opponent..."
                          }
                          className={cn(`
                            flex-1 px-6 py-4 rounded-xl border bg-white/5 text-white 
                            placeholder:text-gray-400 focus:outline-none focus:ring-2 
                            focus:ring-purple-400 transition-all hover:border-white/40
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-white/20
                            `,
                            invalidLetters.length > 0 
                              ? 'border-red-500/50 focus:ring-red-400' 
                              : 'border-white/20'
                          )}
                        />
                        <button
                          type="submit"
                          disabled={!user || !players.length || user.id !== players[currentTurn]?.id || isLoadingGame}
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
                        <AnimatedScore value={players[0]?.score || 0} />
                      </div>
                      <Tooltip 
                        content={
                          <div className="flex flex-col items-center text-center">
                            <span>{players[0]?.name || 'Unknown Player'}</span>
                            <span className="text-white/60 text-sm">
                              {isLoadingPlayers ? '...' : (players[0]?.elo || '1000')}
                            </span>
                            {players[0] && !isPlayerOnline(players[0].id) && (
                              <span className="text-white/40 text-sm">Offline</span>
                            )}
                          </div>
                        }
                      >
                        <div className="rounded-full relative">
                          <Avatar
                            src={players[0]?.avatar_url}
                            name={players[0]?.name || '?'}
                            size="xl"
                            className={cn(
                              'ring-4 transition-all duration-300',
                              currentTurn === 0
                                ? 'ring-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                : 'ring-white/20',
                              players[0] && !isPlayerOnline(players[0].id) && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={player1Time} 
                              isActive={gameStarted && currentTurn === 0} 
                            />
                          </div>
                          {players[0] && !isPlayerOnline(players[0].id) && (
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
                        <AnimatedScore value={players[1]?.score || 0} />
                      </div>
                      <Tooltip 
                        content={
                          <div className="flex flex-col items-center text-center">
                            <span>{players[1]?.name || 'Unknown Player'}</span>
                            <span className="text-white/60 text-sm">
                              {isLoadingPlayers ? '...' : (players[1]?.elo || '1000')}
                            </span>
                            {players[1] && !isPlayerOnline(players[1].id) && (
                              <span className="text-white/40 text-sm">Offline</span>
                            )}
                          </div>
                        }
                      >
                        <div className="rounded-full relative">
                          <Avatar
                            src={players[1]?.avatar_url}
                            name={players[1]?.name || '?'}
                            size="xl"
                            className={cn(
                              'ring-4 transition-all duration-300',
                              currentTurn === 1
                                ? 'ring-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                : 'ring-white/20',
                              players[1] && !isPlayerOnline(players[1].id) && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={player2Time} 
                              isActive={gameStarted && currentTurn === 1} 
                            />
                          </div>
                          {players[1] && !isPlayerOnline(players[1].id) && (
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