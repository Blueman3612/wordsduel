'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
import { GameSubscriptionManager } from '@/lib/supabase/subscriptions'

// Interfaces
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

  // Basic state
  const [word, setWord] = useState('')
  const [words, setWords] = useState<WordCard[]>([])
  const [invalidLetters, setInvalidLetters] = useState<string[]>([])
  const [isFlashing, setIsFlashing] = useState(false)
  const [reportedWord, setReportedWord] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [currentTurn, setCurrentTurn] = useState<number>(0)
  const [gameStarted, setGameStarted] = useState(false)
  const [player1Time, setPlayer1Time] = useState(180000) // 3 minutes in ms
  const [player2Time, setPlayer2Time] = useState(180000)
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [gameOverInfo, setGameOverInfo] = useState<GameOverInfo | null>(null)
  const [isLoadingGameOver, setIsLoadingGameOver] = useState(false)
  const [subscriptionManager, setSubscriptionManager] = useState<GameSubscriptionManager | null>(null)
  const [onlinePlayers, setOnlinePlayers] = useState<Set<string>>(new Set())
  const [bannedLetters, setBannedLetters] = useState<string[]>([])
  const [expandDirection, setExpandDirection] = useState<'left' | 'right'>('right')

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const currentPlayersRef = useRef<Player[]>([])
  const gameEndStateRef = useRef<{
    players: Player[]
    gameOverInfo: GameOverInfo | null
  }>({
    players: [],
    gameOverInfo: null
  })

  // Keep ref in sync with state
  useEffect(() => {
    currentPlayersRef.current = players
  }, [players])

  // Helper function to get initial banned letters
  const getInitialBannedLetters = useCallback(() => {
    // Randomly select 3 consonants
    const shuffledConsonants = [...consonants].sort(() => Math.random() - 0.5)
    const bannedConsonants = shuffledConsonants.slice(0, 3)
    
    // Randomly select 1 vowel
    const shuffledVowels = [...vowels].sort(() => Math.random() - 0.5)
    const bannedVowel = shuffledVowels[0]
    
    return [...bannedConsonants, bannedVowel]
  }, [consonants, vowels])

  // Helper function to get next banned letter
  const getNextBannedLetter = (currentBannedLetters: string[]) => {
    // Count currently banned vowels
    const bannedVowelCount = currentBannedLetters.filter(letter => vowels.includes(letter)).length
    const availableVowels = vowels.filter(v => !currentBannedLetters.includes(v))
    
    // If we have banned 3 vowels, we can only ban consonants
    if (bannedVowelCount >= 3) {
      const availableConsonants = consonants.filter(c => !currentBannedLetters.includes(c))
      return availableConsonants[Math.floor(Math.random() * availableConsonants.length)]
    }
    
    // Otherwise, randomly choose between consonant and vowel
    const shouldBanVowel = Math.random() < 0.2 && availableVowels.length > 2 // 20% chance to ban a vowel if we can
    if (shouldBanVowel) {
      return availableVowels[Math.floor(Math.random() * availableVowels.length)]
    } else {
      const availableConsonants = consonants.filter(c => !currentBannedLetters.includes(c))
      return availableConsonants[Math.floor(Math.random() * availableConsonants.length)]
    }
  }

  // Function to check for banned letters
  const checkBannedLetters = (word: string): string[] => {
    return bannedLetters.filter(letter => 
      word.toUpperCase().includes(letter)
    )
  }

  // Function to trigger flash animation
  const triggerFlash = () => {
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 1000)
  }

  // Update expand direction for word cards
  const updateExpandDirection = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current
    if (!container) return
    
    const rect = (event.target as HTMLElement).getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const spaceOnRight = containerRect.right - rect.right
    
    setExpandDirection(spaceOnRight < 310 ? 'left' : 'right')
  }

  // Auto-scroll to bottom when words change
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth'
    })
  }, [words])

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
          
          setCurrentTurn(hasWords ? gameState.current_turn : 0);
          setPlayer1Time(gameState.player1_time);
          setPlayer2Time(gameState.player2_time);
          setBannedLetters(gameState.banned_letters || []);
          setGameStarted(hasWords);

          // Update player scores
          setPlayers(prev => {
            const updated = [...prev];
            if (updated[0]) updated[0].score = gameState.player1_score;
            if (updated[1]) updated[1].score = gameState.player2_score;
            return updated;
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

        if (gameWords) {
          const wordCards: WordCard[] = gameWords.map(word => ({
            word: word.word,
            player: players.find(p => p.id === word.player_id)?.name || 'Unknown',
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

          setWords(wordCards);
        }
      } catch (error) {
        console.error('Error in fetchGameStateAndWords:', error);
      }
    };

    fetchGameStateAndWords();
  }, [lobbyId, players, getInitialBannedLetters]);

  // Fetch initial player data
  useEffect(() => {
    const fetchPlayers = async () => {
      if (!lobbyId || !user) return

      try {
        console.log('Fetching players for lobby:', lobbyId)
        
        // First get lobby members
        const { data: membersData, error: membersError } = await supabase
          .from('lobby_members')
          .select('user_id, joined_at')
          .eq('lobby_id', lobbyId)
          .order('joined_at', { ascending: true })

        if (membersError) {
          console.error('Error fetching lobby members:', membersError)
          return
        }

        console.log('Lobby members:', membersData)

        if (!membersData?.length) {
          console.log('No members found in lobby')
          return
        }

        // Get profiles for all members
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, elo')
          .in('id', membersData.map(m => m.user_id))

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError)
          return
        }

        console.log('Player profiles:', profilesData)

        // Transform profiles into Player objects - note removal of isOnline
        const playerProfiles = profilesData?.map((profile) => ({
          id: profile.id,
          name: profile.display_name,
          elo: profile.elo,
          score: 0,
          avatar_url: profile.avatar_url,
          originalElo: profile.elo,
          games_played: 0
        })) || []

        setPlayers(playerProfiles)
        console.log('Set players:', playerProfiles)

      } catch (error) {
        console.error('Error in fetchPlayers:', error)
      }
    }

    fetchPlayers()
  }, [lobbyId, user])

  // Subscription effect
  useEffect(() => {
    if (!lobbyId || !user) return

    let isSubscribed = true
    const initializeSubscriptions = async () => {
      try {
        // Get lobby data to determine if user is host
        const { data: lobbyData } = await supabase
          .from('lobbies')
          .select('host_id, game_config')
          .eq('id', lobbyId)
          .single()

        const isHost = lobbyData?.host_id === user.id

        // Create subscription manager
        const manager = new GameSubscriptionManager(
          lobbyId,
          user.id,
          isHost,
          {
            onPresenceSync: async (state) => {
              if (!isSubscribed) return
              console.log('Raw presence state:', state)
              
              const onlineIds = new Set<string>()
              Object.entries(state).forEach(([key, presences]) => {
                console.log('Processing presence key:', key, 'presences:', presences)
                ;(presences as PresenceState[]).forEach(presence => {
                  if (presence.user_id) {
                    console.log('Adding online user:', presence.user_id)
                    onlineIds.add(presence.user_id)
                  }
                })
              })

              console.log('Final online IDs:', Array.from(onlineIds))
              setOnlinePlayers(onlineIds)

              // Host-specific: Initialize game state when both players are present
              if (isHost && onlineIds.size === 2) {
                try {
                  const { data: existingState, error: checkError } = await supabase
                    .from('game_state')
                    .select('*')
                    .eq('lobby_id', lobbyId)
                    .maybeSingle()

                  if (checkError) {
                    console.error('Error checking game state:', checkError)
                    return
                  }

                  if (!existingState) {
                    console.log('Initializing game state with config:', lobbyData?.game_config)
                    const { error: stateError } = await supabase
                      .from('game_state')
                      .upsert({
                        lobby_id: lobbyId,
                        current_turn: 0,
                        player1_time: lobbyData?.game_config.base_time || 180000,
                        player2_time: lobbyData?.game_config.base_time || 180000,
                        player1_score: 0,
                        player2_score: 0,
                        status: 'active',
                        banned_letters: getInitialBannedLetters(),
                        last_move_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        updated_by: user.id
                      }, {
                        onConflict: 'lobby_id'
                      })

                    if (stateError) {
                      console.error('Error initializing game state:', stateError)
                      return
                    }
                  }
                } catch (error) {
                  console.error('Error in game state initialization:', error)
                }
              }
            },
            onPlayerJoin: ({ key, newPresences }) => {
              console.log('Player joined:', key, newPresences)
            },
            onPlayerLeave: ({ key, leftPresences }) => {
              console.log('Player left:', key, leftPresences)
            },
            onGameStateChange: async (payload) => {
              if (!isSubscribed) return

              const newState = payload.new as GameState
              console.log('[Game State Sub] Received state update:', {
                status: newState.status,
                elo_updated: newState.elo_updated,
                showingModal: showGameOverModal,
                currentPlayers: currentPlayersRef.current.map(p => ({
                  id: p.id,
                  name: p.name,
                  elo: p.elo,
                  originalElo: p.originalElo
                }))
              })

              // Update game state
              setCurrentTurn(newState.current_turn)
              setPlayer1Time(newState.player1_time)
              setPlayer2Time(newState.player2_time)
              setBannedLetters(newState.banned_letters || [])
              
              // Update player scores
              setPlayers(prev => {
                const updated = [...prev]
                if (updated[0]) updated[0].score = newState.player1_score
                if (updated[1]) updated[1].score = newState.player2_score
                return updated
              })

              if (newState.status === 'finished' && !showGameOverModal) {
                console.log('[Game End] Game finished, checking profiles')
                setIsLoadingGameOver(true)

                try {
                  // Get updated profiles with new ELO
                  const { data: profiles, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, display_name, elo')
                    .in('id', currentPlayersRef.current.map(p => p.id))

                  if (profileError) throw profileError

                  // Map profiles to players with ELO changes
                  const updatedPlayers = currentPlayersRef.current.map(player => {
                    const profile = profiles?.find(p => p.id === player.id)
                    return {
                      ...player,
                      elo: profile?.elo || player.elo
                    }
                  })

                  // Determine winner and loser
                  const winner = updatedPlayers[newState.current_turn]
                  const loser = updatedPlayers[newState.current_turn === 0 ? 1 : 0]

                  // Store game end state in ref for consistent access
                  gameEndStateRef.current = {
                    players: updatedPlayers,
                    gameOverInfo: {
                      winner: {
                        id: winner.id,
                        name: winner.name,
                        elo: winner.elo,
                        originalElo: winner.originalElo,
                        avatar_url: winner.avatar_url,
                        score: winner.score
                      },
                      loser: {
                        id: loser.id,
                        name: loser.name,
                        elo: loser.elo,
                        originalElo: loser.originalElo,
                        avatar_url: loser.avatar_url,
                        score: loser.score
                      },
                      reason: 'time'
                    }
                  }

                  // Use a timeout to ensure state updates are processed in order
                  setTimeout(() => {
                    if (!isSubscribed) return
                    
                    // Update all state at once in the next tick
                    setPlayers(gameEndStateRef.current.players)
                    setGameOverInfo(gameEndStateRef.current.gameOverInfo)
                    setShowGameOverModal(true)
                    setIsLoadingGameOver(false)
                    
                    console.log('[Game End] State updates completed:', {
                      players: gameEndStateRef.current.players,
                      gameOverInfo: gameEndStateRef.current.gameOverInfo,
                      winner: {
                        id: gameEndStateRef.current.gameOverInfo?.winner?.id,
                        name: gameEndStateRef.current.gameOverInfo?.winner?.name,
                        elo: gameEndStateRef.current.gameOverInfo?.winner?.elo,
                        originalElo: gameEndStateRef.current.gameOverInfo?.winner?.originalElo,
                        avatar_url: gameEndStateRef.current.gameOverInfo?.winner?.avatar_url,
                        score: gameEndStateRef.current.gameOverInfo?.winner?.score
                      },
                      loser: {
                        id: gameEndStateRef.current.gameOverInfo?.loser?.id,
                        name: gameEndStateRef.current.gameOverInfo?.loser?.name,
                        elo: gameEndStateRef.current.gameOverInfo?.loser?.elo,
                        originalElo: gameEndStateRef.current.gameOverInfo?.loser?.originalElo,
                        avatar_url: gameEndStateRef.current.gameOverInfo?.loser?.avatar_url,
                        score: gameEndStateRef.current.gameOverInfo?.loser?.score
                      }
                    })
                  }, 0)
                } catch (error) {
                  console.error('[Game End] Error handling game end:', error)
                  setIsLoadingGameOver(false)
                }
              }
            },
            onGameWordAdded: (payload: RealtimePostgresChangesPayload<GameWord>) => {
              if (!payload.new || !('word' in payload.new)) return

              const newWord = payload.new as GameWord
              // Add word to the list
              setWords(prev => {
                if (prev.some(w => w.word === newWord.word)) return prev

                const wordCard: WordCard = {
                  word: newWord.word,
                  player: players.find(p => p.id === newWord.player_id)?.name || 'Unknown',
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

                return [...prev, wordCard]
              })

              // Update game started state
              setGameStarted(true)
            }
          }
        )

        await manager.initialize()
        setSubscriptionManager(manager)
      } catch (error) {
        console.error('Error initializing subscriptions:', error)
      }
    }

    initializeSubscriptions()

    return () => {
      isSubscribed = false
      subscriptionManager?.cleanup()
    }
  }, [lobbyId, user, showGameOverModal, players])

  // Timer effect - host updates game state every second
  useEffect(() => {
    if (!lobbyId || !user || !gameStarted || !words.length) return;

    let interval: NodeJS.Timeout;
    let isHostChecked = false;
    let isHost = false;
    let lastKnownState: {
      currentTurn: number;
      player1Time: number;
      player2Time: number;
      lastMoveAt: string;
    } | null = null;

    const checkHostAndSync = async () => {
      if (!isHostChecked) {
        const { data: lobbyData } = await supabase
          .from('lobbies')
          .select('host_id')
          .eq('id', lobbyId)
          .single();
        
        isHost = lobbyData?.host_id === user.id;
        isHostChecked = true;

        if (!isHost) return false;

        const { data: gameState } = await supabase
          .from('game_state')
          .select('last_move_at, current_turn, player1_time, player2_time')
          .eq('lobby_id', lobbyId)
          .single();

        if (gameState) {
          lastKnownState = {
            currentTurn: gameState.current_turn,
            player1Time: gameState.player1_time,
            player2Time: gameState.player2_time,
            lastMoveAt: gameState.last_move_at
          };
        }
      }
      return isHost;
    };

    const startTimer = async () => {
      const shouldContinue = await checkHostAndSync();
      if (!shouldContinue) return;

      interval = setInterval(async () => {
        const { data: currentState } = await supabase
          .from('game_state')
          .select('current_turn, player1_time, player2_time, last_move_at, status')
          .eq('lobby_id', lobbyId)
          .single();
          
        if (!currentState || currentState.status === 'finished') {
          if (interval) clearInterval(interval);
          return;
        }

        if (!lastKnownState) {
          lastKnownState = {
            currentTurn: currentState.current_turn,
            player1Time: currentState.player1_time,
            player2Time: currentState.player2_time,
            lastMoveAt: currentState.last_move_at
          };
          return;
        }

        const isNewMove = new Date(currentState.last_move_at).getTime() > new Date(lastKnownState.lastMoveAt).getTime();

        if (isNewMove) {
          lastKnownState = {
            currentTurn: currentState.current_turn,
            player1Time: currentState.player1_time,
            player2Time: currentState.player2_time,
            lastMoveAt: currentState.last_move_at
          };
          return;
        }

        const currentPlayerTime = lastKnownState.currentTurn === 0 
          ? lastKnownState.player1Time 
          : lastKnownState.player2Time;

        if (currentPlayerTime <= 0) {
          console.log('[Game End] Timer reached zero', {
            isHost,
            currentTurn: lastKnownState.currentTurn,
            player1Time: lastKnownState.player1Time,
            player2Time: lastKnownState.player2Time
          });

          if (interval) clearInterval(interval);

          // Only host calls the handle_game_end function
          if (isHost) {
            console.log('[Game End] Host is calling handle_game_end');
            try {
              const { data: { session } } = await supabase.auth.getSession();
              console.log('[Game End] Got session token:', !!session?.access_token);
              
              console.log('[Game End] Making Edge Function call with payload:', {
                lobby_id: lobbyId,
                game_status: 'finished',
                reason: 'time'
              });
              
              const response = await supabase.functions.invoke('handle_game_end', {
                body: {
                  lobby_id: lobbyId,
                  game_status: 'finished',
                  reason: 'time'
                },
                headers: {
                  Authorization: `Bearer ${session?.access_token}`
                }
              });

              console.log('[Game End] Edge Function response:', {
                error: response.error,
                data: response.data,
                status: response.error ? 'error' : 'success'
              });

              if (response.error) {
                console.error('[Game End] Error calling handle_game_end:', response.error);
              }
            } catch (error) {
              console.error('[Game End] Exception in handle_game_end call:', error);
            }
          } else {
            console.log('[Game End] Non-host client waiting for game state update');
          }
          
          return;
        }

        const newTime = Math.max(0, currentPlayerTime - 1000);
        
        lastKnownState = {
          currentTurn: lastKnownState.currentTurn,
          lastMoveAt: lastKnownState.lastMoveAt,
          player1Time: lastKnownState.currentTurn === 0 ? newTime : lastKnownState.player1Time,
          player2Time: lastKnownState.currentTurn === 1 ? newTime : lastKnownState.player2Time
        };

        const { error: stateError } = await supabase
          .from('game_state')
          .update({
            [lastKnownState.currentTurn === 0 ? 'player1_time' : 'player2_time']: newTime,
            updated_at: new Date().toISOString(),
            updated_by: user.id
          })
          .eq('lobby_id', lobbyId);

        if (stateError) {
          console.error('Error updating game time:', stateError);
        }
      }, 1000);
    };

    startTimer();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [lobbyId, user?.id, gameStarted, words.length, user]);

  // Basic word submission handler
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
      // Check if word has been used before
      const { data: existingWords } = await supabase
        .from('game_words')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('word', trimmedWord);

      if (existingWords && existingWords.length > 0) {
        showToast('This word has already been used!', 'error')
        return
      }

      // Validate word length
      if (trimmedWord.length < 5) {
        showToast('Word must be at least 5 letters long!', 'error')
        return
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
      const previousWord = words.length > 0 ? words[words.length - 1].word : null
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
          current_turn: currentTurn === 0 ? 1 : 0,
          [isPlayerOne ? 'player1_score' : 'player2_score']: players[isPlayerOne ? 0 : 1].score + totalScore,
          [isPlayerOne ? 'player1_time' : 'player2_time']: (isPlayerOne ? player1Time : player2Time) + timeIncrement,
          banned_letters: (() => {
            // If this is the 5th word (index 4) or every 5th word after that
            if (words.length % 5 === 4 && bannedLetters.length < 18) {
              const nextBannedLetter = getNextBannedLetter(bannedLetters)
              return [...bannedLetters, nextBannedLetter]
            }
            return bannedLetters
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
  const getPlayerOnlineStatus = (playerId: string) => onlinePlayers.has(playerId)

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

  return (
    <PageTransition>
      <main className="min-h-screen">
        {/* Game Over Modal */}
        <ActionModal
          isOpen={showGameOverModal}
          onClose={() => {
            setShowGameOverModal(false)
            setGameOverInfo(null)
            router.push('/')
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
          {isLoadingGameOver ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <div className="w-12 h-12 border-4 border-purple-500/50 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-white/70">Loading game results...</p>
            </div>
          ) : gameOverInfo && gameOverInfo.winner && gameOverInfo.loser ? (
            <div className="space-y-8">
              {/* Victory/Defeat Banner */}
              {user?.id === gameOverInfo.winner.id ? (
                <div className="text-center">
                  <h3 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Victory!
                  </h3>
                </div>
              ) : user?.id === gameOverInfo.loser.id ? (
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
                  <div className="text-center space-y-2">
                    <p className="font-medium text-white/90">{gameOverInfo.winner?.name}</p>
                    <div className="space-y-1">
                      <p className="text-3xl font-bold text-white/90">
                        {gameOverInfo.winner?.elo || 0}
                        <span className="text-green-400 text-xxl ml-2">
                        (+{(gameOverInfo.winner?.elo || 0) - (gameOverInfo.winner?.originalElo || 0)})
                      </span>
                    </p>
                      <p className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        {gameOverInfo.winner?.score || 0}
                      </p>
                    </div>
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
                  <div className="text-center space-y-2">
                    <p className="font-medium text-white/90">{gameOverInfo.loser?.name}</p>
                    <div className="space-y-1">
                      <p className="text-3xl font-bold text-white/90">
                        {gameOverInfo.loser?.elo || 0}
                        <span className="text-red-400 text-xxl ml-2">
                        ({(gameOverInfo.loser?.elo || 0) - (gameOverInfo.loser?.originalElo || 0)})
                      </span>
                    </p>
                      <p className="text-xl font-bold text-white/60">
                        {gameOverInfo.loser?.score || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Game End Reason */}
              <div className="text-center text-sm text-white/60">
                Game ended due to {gameOverInfo.reason === 'time' ? 'time expiration' : 'forfeit'}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-white/70">No game results available</p>
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
                          disabled={!user || !players.length || user.id !== players[currentTurn]?.id}
                          placeholder={
                            user?.id === players[currentTurn]?.id 
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
                          disabled={!user || !players.length || user.id !== players[currentTurn]?.id}
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
                              {players[0]?.elo || '1000'}
                            </span>
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
                              getPlayerOnlineStatus(players[0]?.id) === false && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={player1Time} 
                              isActive={gameStarted && currentTurn === 0} 
                            />
                          </div>
                          {getPlayerOnlineStatus(players[0]?.id) === false && (
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
                              {players[1]?.elo || '1000'}
                            </span>
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
                              getPlayerOnlineStatus(players[1]?.id) === false && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={player2Time} 
                              isActive={gameStarted && currentTurn === 1} 
                            />
                          </div>
                          {getPlayerOnlineStatus(players[1]?.id) === false && (
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