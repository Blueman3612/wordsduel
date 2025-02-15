'use client'

import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
      
      <div className="relative container mx-auto max-w-4xl p-8">
        {/* Header */}
        <div className="h-screen flex flex-col items-center justify-center">
          <h1 className="text-7xl font-bold mb-6 text-white tracking-tight">
            Words
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Duel
            </span>
          </h1>
          <div className="text-2xl text-gray-300 mb-12">
            A battle of words and wit
          </div>
          
          <Button
            onClick={() => router.push('/game')}
          >
            Start Game
          </Button>
        </div>
      </div>
    </main>
  )
}
