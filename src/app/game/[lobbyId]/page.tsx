'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, Flag } from 'lucide-react'
import { ActionModal } from '@/components/game/ActionModal'
import { PageTransition } from '@/components/layout/PageTransition'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { Avatar } from '@/components/ui/Avatar'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils/cn'
import { calculateLevenshteinDistance, scoreWord, SCORING_WEIGHTS } from '@/lib/utils/word-scoring'
import { AnimatedScore } from '@/components/game/AnimatedScore'
import { Timer } from '@/components/game/Timer'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { use } from 'react'

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
  isOnline?: boolean
  originalElo?: number
}

// Scoring weights - can be adjusted to taste
const SCORING_CONFIG = {
  letterRarityWeights: SCORING_WEIGHTS.RARITY.LETTER_WEIGHTS
} as const

type LetterRarity = typeof SCORING_CONFIG.letterRarityWeights
type Letter = keyof LetterRarity

// Add these interfaces for type safety
interface GameState {
  current_turn: number
  player1_time: number
  player2_time: number
  player1_score: number
  player2_score: number
  status: 'active' | 'paused' | 'finished'
  banned_letters: string[]
}

interface GameWord {
  id: string
  word: string
  player_id: string
  is_valid: boolean
  score?: number
  score_breakdown?: {
    lengthScore: number
    levenBonus: number
    rarityBonus: number
  }
  part_of_speech?: string
  definition?: string
  phonetics?: string
}

type GameStatePayload = RealtimePostgresChangesPayload<GameState>
type GameWordPayload = RealtimePostgresChangesPayload<GameWord>

interface GamePageProps {
  params: Promise<{
    lobbyId: string
  }>
}

export default function GamePage({ params }: GamePageProps) {
  const { lobbyId } = use(params)
  const { user } = useAuth()
  const { showToast } = useToast()
  const router = useRouter()
  
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
  const [gameOverInfo, setGameOverInfo] = useState<{
    winner: Player | null
    loser: Player | null
    reason: 'time' | 'forfeit'
  } | null>(null)
  
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [expandDirection, setExpandDirection] = useState<'left' | 'right'>('right')
  const [bannedLetters, setBannedLetters] = useState<string[]>([])

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

        // Transform profiles into Player objects
        const playerProfiles = profilesData?.map((profile, index) => ({
          id: profile.id,
          name: profile.display_name,
          elo: profile.elo,
          score: 0,
          avatar_url: profile.avatar_url,
          isOnline: true,
          originalElo: profile.elo
        })) || []

        setPlayers(playerProfiles)
        console.log('Set players:', playerProfiles)

      } catch (error) {
        console.error('Error in fetchPlayers:', error)
      }
    }

    fetchPlayers()
  }, [lobbyId, user])

  // Game parameters
  const parameters = [
    'at least 5 letters long',
    'a singular non-proper noun, adjective, adverb, or infinitive verb'
  ]
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const vowels = ['A', 'E', 'I', 'O', 'U']
  const consonants = alphabet.filter(letter => !vowels.includes(letter))

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

  // Add subscription effect
  useEffect(() => {
    if (!lobbyId || !user) return

    // Set up single channel for all game-related subscriptions
    const channel = supabase.channel(`game_room:${lobbyId}`)
      // Game state changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `lobby_id=eq.${lobbyId}`
        },
        (payload: GameStatePayload) => {
          const newState = payload.new as GameState
          if (!newState) return
          
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

          // Handle game end
          if (newState.status === 'finished' && !showGameOverModal) {
            const winner = newState.player1_time <= 0 ? players[1] : players[0]
            const loser = newState.player1_time <= 0 ? players[0] : players[1]
            
            setGameOverInfo({
              winner,
              loser,
              reason: 'time'
            })
            setShowGameOverModal(true)
          }
        }
      )
      // Word plays
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_words',
          filter: `lobby_id=eq.${lobbyId}`
        },
        (payload: GameWordPayload) => {
          const newWord = payload.new as GameWord
          if (!newWord) return

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
      )
      // Player presence
      .on(
        'presence',
        { event: 'sync' },
        () => {
          const state = channel.presenceState()
          
          // Update player online status
          setPlayers(prev => {
            return prev.map(player => ({
              ...player,
              isOnline: Object.keys(state).some(id => id === player.id)
            }))
          })
        }
      )
      .subscribe()

    // Track local player's presence
    if (user) {
      channel.track({ user_id: user.id })
    }

    return () => {
      channel.unsubscribe()
    }
  }, [lobbyId, user, players, showGameOverModal])

  // Basic word submission handler (to be expanded)
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

    // TODO: Implement word validation and game state updates
  }

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
                              players[0] && !players[0].isOnline && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={player1Time} 
                              isActive={gameStarted && currentTurn === 0} 
                            />
                          </div>
                          {players[0] && !players[0].isOnline && (
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
                              players[1] && !players[1].isOnline && 'opacity-50'
                            )}
                          />
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                            <Timer 
                              timeLeft={player2Time} 
                              isActive={gameStarted && currentTurn === 1} 
                            />
                          </div>
                          {players[1] && !players[1].isOnline && (
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