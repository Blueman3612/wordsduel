// This is a Server Component
import { Metadata } from 'next'
import { GameClient } from './GameClient'

export const metadata: Metadata = {
  title: 'Game - WordsDuel',
  description: 'Play a game of WordsDuel'
}

export default function GamePage({ params }: { params: { lobbyId: string } }) {
  return <GameClient lobbyId={params.lobbyId} />
} 