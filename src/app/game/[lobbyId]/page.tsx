'use client'

import { useState, useRef, useEffect } from 'react'
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

interface GameWord {
  id: string
  created_at: string
  lobby_id: string
  player_id: string
  word: string
  is_valid: boolean
  score?: number
  score_breakdown?: {
    lengthScore: number
    uniqueLetterBonus: number
    levenBonus: number
    rarityBonus: number
  }
  part_of_speech?: string
  definition?: string
  phonetics?: string
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
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true)
  const [currentTurn, setCurrentTurn] = useState<number>(0) // Start with player 1 (non-host)
  
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [expandDirection, setExpandDirection] = useState<'left' | 'right'>('right')
  const channelRef = useRef<RealtimeChannel | null>(null)

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

  // Fetch lobby members and their profiles
  useEffect(() => {
    if (!user) return

    const fetchLobbyMembers = async () => {
      setIsLoadingPlayers(true)
      try {
        // First get the lobby members
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
          const formattedPlayers: Player[] = profiles.map(profile => ({
            id: profile.id,
            name: profile.display_name,
            elo: profile.elo || 1200,
            score: 0,
            avatar_url: profile.avatar_url
          }))
          setPlayers(formattedPlayers)
        }
      } catch (error) {
        console.error('Error fetching players:', error)
        showToast('Error loading players', 'error')
      }
      setIsLoadingPlayers(false)
    }

    fetchLobbyMembers()
  }, [user, lobbyId, showToast])

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
        .single()

      if (error || !data) {
        showToast('You are not a member of this lobby', 'error')
        // Redirect to lobbies page if not a member
        window.location.href = '/lobbies'
        return
      }
    }

    checkLobbyMembership()
  }, [user, lobbyId, showToast])

  // Subscribe to word updates
  useEffect(() => {
    if (!lobbyId) return

    // Subscribe to word changes
    channelRef.current = supabase
      .channel(`game:${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_words',
          filter: `lobby_id=eq.${lobbyId}`
        },
        (payload) => {
          const newWord = payload.new as GameWord
          if (newWord) {
            console.log('New word data:', newWord)
            console.log('Score breakdown:', newWord.score_breakdown)
            
            // Find player who played the word
            const player = players.find(p => p.id === newWord.player_id)
            
            const wordCard = {
              word: newWord.word,
              player: player?.name || 'Unknown',
              timestamp: Date.parse(newWord.created_at),
              isInvalid: !newWord.is_valid,
              score: newWord.score,
              scoreBreakdown: newWord.score_breakdown,
              dictionary: {
                partOfSpeech: newWord.part_of_speech,
                definition: newWord.definition,
                phonetics: newWord.phonetics
              }
            }
            console.log('Word card data:', wordCard)
            
            setWords(prev => [...prev, wordCard])
            
            // Update player score if score exists and is valid
            if (typeof newWord.score === 'number' && !isNaN(newWord.score) && newWord.is_valid) {
              setPlayers(prev => {
                const updatedPlayers = [...prev]
                const playerIndex = updatedPlayers.findIndex(p => p.id === newWord.player_id)
                if (playerIndex !== -1) {
                  const currentScore = updatedPlayers[playerIndex].score || 0
                  updatedPlayers[playerIndex] = {
                    ...updatedPlayers[playerIndex],
                    score: currentScore + (newWord.score || 0)
                  }
                }
                return updatedPlayers
              })
            }

            // Update turn if word was valid
            if (newWord.is_valid) {
              setCurrentTurn(prev => prev === 0 ? 1 : 0)
            }
          }
        }
      )
      .subscribe()

    // Fetch existing words
    const fetchExistingWords = async () => {
      const { data: gameWords, error } = await supabase
        .from('game_words')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching words:', error)
        return
      }

      if (gameWords) {
        // Calculate total scores for each player
        const playerScores: { [key: string]: number } = {}
        gameWords.forEach((word: GameWord) => {
          if (word.is_valid && word.score) {
            playerScores[word.player_id] = (playerScores[word.player_id] || 0) + word.score
          }
        })

        // Update players with their total scores
        setPlayers(prev => prev.map(player => ({
          ...player,
          score: playerScores[player.id] || 0
        })))

        const formattedWords = gameWords.map((word: GameWord) => {
          const player = players.find(p => p.id === word.player_id)
          return {
            word: word.word,
            player: player?.name || 'Unknown',
            timestamp: Date.parse(word.created_at),
            isInvalid: !word.is_valid,
            score: word.score,
            scoreBreakdown: word.score_breakdown,
            dictionary: {
              partOfSpeech: word.part_of_speech,
              definition: word.definition,
              phonetics: word.phonetics
            }
          }
        })
        setWords(formattedWords)

        // Set current turn based on number of valid words
        const validWordsCount = gameWords.filter(w => w.is_valid).length
        setCurrentTurn(validWordsCount % 2)
      }
    }

    fetchExistingWords()

    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [lobbyId, players])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedWord = word.trim().toLowerCase()
    if (!trimmedWord || !players.length || !user) return
    
    // Clear input immediately
    setWord('')

    // Verify it's the player's turn
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
      const { data: existingWord } = await supabase
        .from('game_words')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('word', trimmedWord)
        .single()

      if (existingWord) {
        showToast('This word has already been played!', 'error')
        return
      }

      // Check if word exists in dictionary
      const { data: dictData, error: dictError } = await supabase
        .from('words')
        .select('part_of_speech, definitions, phonetics')
        .eq('word', trimmedWord)

      // Word is valid if we have any matching entries
      const isValid = !dictError && dictData && dictData.length > 0
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
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
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
                          disabled={!user || !players.length || user.id !== players[currentTurn]?.id}
                          placeholder={user?.id === players[currentTurn]?.id 
                            ? "Type your word..." 
                            : "Waiting for opponent..."}
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
                      <Tooltip content={players[0]?.name || 'Unknown Player'}>
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
                        <div className="mt-2 text-white/80 text-sm font-medium bg-white/5 px-2 py-0.5 rounded-md backdrop-blur-sm border border-white/10">
                          {isLoadingPlayers ? '...' : (players[0]?.elo || '1000')}
                        </div>
                      </div>
                    </div>
                    
                    <span className="text-white/40 text-2xl font-light">VS</span>
                    
                    <div className="relative">
                      {/* Score Display */}
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                        <AnimatedScore value={players[1]?.score || 0} />
                      </div>
                      <Tooltip content={players[1]?.name || 'Unknown Player'}>
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
                        <div className="mt-2 text-white/80 text-sm font-medium bg-white/5 px-2 py-0.5 rounded-md backdrop-blur-sm border border-white/10">
                          {isLoadingPlayers ? '...' : (players[1]?.elo || '1000')}
                        </div>
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