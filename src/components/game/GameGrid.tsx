'use client'

import { useState } from 'react'
import { useGameStore } from '@/lib/store/gameStore'
import { GameParameter, Player } from '@/types/game'

export function GameGrid() {
  const [inputWord, setInputWord] = useState('')
  const {
    currentParameter,
    currentPlayer,
    usedWords,
    timeLimit,
    addUsedWord,
    setCurrentPlayer,
    players
  } = useGameStore()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputWord.trim() && !usedWords.includes(inputWord.toLowerCase())) {
      addUsedWord(inputWord.toLowerCase())
      // Switch to next player
      const currentPlayerIndex = players.findIndex((p: Player) => p.id === currentPlayer)
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
      setCurrentPlayer(players[nextPlayerIndex].id)
      setInputWord('')
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
        <div className="flex gap-4">
          <input
            type="text"
            value={inputWord}
            onChange={(e) => setInputWord(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg"
            placeholder="Type your word..."
          />
          <button
            type="submit"
            className="px-6 py-2 bg-primary text-white rounded-lg"
          >
            Submit
          </button>
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