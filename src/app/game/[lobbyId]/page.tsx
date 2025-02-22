// This is a Server Component
import { Metadata } from 'next'
import { GameClient } from './GameClient'
import { Suspense } from 'react'

interface GamePageProps {
  params: Promise<{
    lobbyId: string
  }>
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const resolvedParams = await params
  return {
    title: `Game ${resolvedParams.lobbyId} - Logobout`,
    description: 'Play a game of Logobout'
  }
}

export default async function GamePage({ params }: GamePageProps) {
  const resolvedParams = await params
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GameClient lobbyId={resolvedParams.lobbyId} />
    </Suspense>
  )
} 