'use client'

import { useState } from 'react'
import { useGameStore } from '@/lib/store/gameStore'
import { Player } from '@/types/game'

export function GameGrid() {
  const [inputWord, setInputWord] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const {
    currentParameter,
    currentPlayer,
    usedWords,
    addUsedWord,
    setCurrentPlayer,
    players,
    setWinner
  } = useGameStore()

  const validateAndSubmitWord = async (word: string) => {
    setIsValidating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          word,
          parameter: currentParameter
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to validate word')
      }

      if (!data.isValid) {
        setError('Invalid word for the current parameter')
        setWinner(players.find(p => p.id !== currentPlayer)?.id || '')
        return false
      }

      return true
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      setError('Failed to validate word')
      return false
    } finally {
      setIsValidating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inputWord.trim() || usedWords.includes(inputWord.toLowerCase())) {
      setError('Word already used or empty')
      return
    }

    const isValid = await validateAndSubmitWord(inputWord.trim())
    
    if (isValid) {
      addUsedWord(inputWord.toLowerCase())
      // Switch to next player
      const currentPlayerIndex = players.findIndex((p: Player) => p.id === currentPlayer)
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
      setCurrentPlayer(players[nextPlayerIndex].id)
      setInputWord('')
      setError(null)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Current Parameter</h2>
        <div className="bg-primary/10 p-4 rounded-lg">
          <p className="text-lg">
            Type: {currentParameter.type}
            {currentParameter.value && ` (${currentParameter.value})`}
          </p>
          <p>Difficulty Level: {currentParameter.difficulty}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <input
              type="text"
              value={inputWord}
              onChange={(e) => setInputWord(e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg"
              placeholder="Type your word..."
              disabled={isValidating}
            />
            <button
              type="submit"
              className="px-6 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
              disabled={isValidating}
            >
              {isValidating ? 'Checking...' : 'Submit'}
            </button>
          </div>
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}
        </div>
      </form>

      <div>
        <h3 className="text-xl font-bold mb-4">Used Words</h3>
        <div className="grid grid-cols-3 gap-4">
          {usedWords.map((word: string, index: number) => (
            <div
              key={index}
              className="bg-secondary/10 p-2 rounded-lg text-center"
            >
              {word}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 