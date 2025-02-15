'use client'

import { useEffect } from 'react'
import { GameGrid } from '@/components/game/GameGrid'
import { useGameStore } from '@/lib/store/gameStore'

export default function GamePage() {
  const { status, resetGame } = useGameStore()

  useEffect(() => {
    // Initialize a new game when the component mounts
    resetGame()
  }, [resetGame])

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <h1 className="text-4xl font-bold text-center mb-8">WordsDuel</h1>
        <GameGrid />
      </div>
    </main>
  )
} 