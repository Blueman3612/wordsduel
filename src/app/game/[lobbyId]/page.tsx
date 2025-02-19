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
import { calculateLevenshteinDistance, scoreWord, SCORING_WEIGHTS } from '@/lib/utils/word-scoring'
import { AnimatedScore } from '@/components/game/AnimatedScore'
import { Timer } from '@/components/game/Timer'

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
  last_timer_update: string
}

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
const INITIAL_TIME = 3 * 60 * 1000 // 3 minutes in milliseconds
const STORAGE_KEY_PREFIX = 'wordsduel_timer_' // Prefix for localStorage keys

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
  const [player1Time, setPlayer1Time] = useState(INITIAL_TIME)
  const [player2Time, setPlayer2Time] = useState(INITIAL_TIME)
  const [isLoadingGame, setIsLoadingGame] = useState(true)
  
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [expandDirection, setExpandDirection] = useState<'left' | 'right'>('right')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const playersRef = useRef<Player[]>([])
  const currentTurnRef = useRef<number>(0)
  const player1TimeRef = useRef<number>(INITIAL_TIME)
  const player2TimeRef = useRef<number>(INITIAL_TIME)

  // Add timerState to component state
  const [timerState, setTimerState] = useState<{
    last_tick: number;
    is_paused: boolean;
  }>({ last_tick: Date.now(), is_paused: false });

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

  // Move initializeGameState to useCallback
  const initializeGameState = useCallback(async () => {
    if (!user) return;

    try {
      // Use the new initialize_game_state function
      const { error } = await supabase.rpc('initialize_game_state', {
        p_lobby_id: lobbyId,
        p_user_id: user.id
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

          // Type assertion for the payload
          const newState = payload.new as unknown as GameState
          console.log('Received game state update:', newState)
          
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
          if (newState.status === 'finished') {
            showToast('Game Over!', 'info')
            // Additional game over logic here
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
              const { error: processError } = await supabase.rpc('process_game_move', {
                p_lobby_id: lobbyId,
                p_player_id: completeWord.player_id,
                p_word: completeWord.word,
                p_score: completeWord.score || 0,
                p_is_valid: true
              })

              if (processError) {
                console.error('Error processing move:', processError)
                showToast('Error processing move', 'error')
              }
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

  // Load saved timer values after mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedPlayer1Time = localStorage.getItem(`${STORAGE_KEY_PREFIX}${lobbyId}_p1`)
    const savedPlayer2Time = localStorage.getItem(`${STORAGE_KEY_PREFIX}${lobbyId}_p2`)

    if (savedPlayer1Time) {
      setPlayer1Time(Number(savedPlayer1Time))
    }
    if (savedPlayer2Time) {
      setPlayer2Time(Number(savedPlayer2Time))
    }
  }, [lobbyId])

  // Persist timer values to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${lobbyId}_p1`, player1Time.toString())
  }, [player1Time, lobbyId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${lobbyId}_p2`, player2Time.toString())
  }, [player2Time, lobbyId])

  // Check if game has started (any valid words played)
  useEffect(() => {
    const hasValidWords = words.some(w => !w.isInvalid)
    setGameStarted(hasValidWords)
  }, [words])

  // Replace the existing timer effect with this simplified version
  useEffect(() => {
    if (!user || !lobbyId || players.length < 2 || !gameStarted) return;

    let lastUpdateTime = Date.now();
    
    const updateTimer = async () => {
      const now = Date.now();
      const deltaTime = now - lastUpdateTime;
      
      if (!timerState.is_paused && user?.id === players[currentTurn]?.id) {
        // Update the timer of the current player
        if (currentTurn === 0) {
          const newTime = Math.max(0, player1Time - deltaTime);
          setPlayer1Time(newTime);
          
          // Update server every second
          if (now - timerState.last_tick >= 1000) {
            const { error } = await supabase
              .from('game_state')
              .update({
                player1_time: Math.round(newTime)
              })
              .eq('lobby_id', lobbyId);

            if (error) {
              console.error('Error updating timer:', error);
            } else {
              setTimerState(prev => ({ ...prev, last_tick: now }));
            }
          }
        } else {
          const newTime = Math.max(0, player2Time - deltaTime);
          setPlayer2Time(newTime);
          
          // Update server every second
          if (now - timerState.last_tick >= 1000) {
            const { error } = await supabase
              .from('game_state')
              .update({
                player2_time: Math.round(newTime)
              })
              .eq('lobby_id', lobbyId);

            if (error) {
              console.error('Error updating timer:', error);
            } else {
              setTimerState(prev => ({ ...prev, last_tick: now }));
            }
          }
        }
      }
      
      lastUpdateTime = now;
    };

    // Set up interval for timer updates
    const interval = setInterval(updateTimer, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [user, lobbyId, players, gameStarted, currentTurn, player1Time, player2Time, timerState]);

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
      console.log('Submitting word:', trimmedWord)
      
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

      console.log('Dictionary check result:', { isValid, dictData })

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

      console.log('Inserting word with score:', { wordScore, scoreBreakdown })

      // Insert word into game_words
      const { error: insertError } = await supabase
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

      if (insertError) {
        console.error('Error inserting word:', insertError)
        showToast('Error submitting word', 'error')
      }
    } catch (error) {
      console.error('Error submitting word:', error)
      showToast('Error submitting word', 'error')
    }
  }

  return (
    <PageTransition>
      <main className="min-h-screen">
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
                {words.map((wordCard, index) => (
                  <div key={index} className="flex items-center">
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

                    {index < words.length - 1 && (
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
                          </div>
                        }
                      >
                        <div className="rounded-full">
                          <Avatar
                            src={players[0]?.avatar_url}
                            name={players[0]?.name || '?'}
                            size="xl"
                            className={cn(
                              'ring-4 transition-all duration-300',
                              currentTurn === 0
                                ? 'ring-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                : 'ring-white/20'
                            )}
                          />
                        </div>
                      </Tooltip>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                        <Timer 
                          timeLeft={player1Time} 
                          isActive={gameStarted && currentTurn === 0} 
                        />
                      </div>
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
                          </div>
                        }
                      >
                        <div className="rounded-full">
                          <Avatar
                            src={players[1]?.avatar_url}
                            name={players[1]?.name || '?'}
                            size="xl"
                            className={cn(
                              'ring-4 transition-all duration-300',
                              currentTurn === 1
                                ? 'ring-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                : 'ring-white/20'
                            )}
                          />
                        </div>
                      </Tooltip>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                        <Timer 
                          timeLeft={player2Time} 
                          isActive={gameStarted && currentTurn === 1}
                        />
                      </div>
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