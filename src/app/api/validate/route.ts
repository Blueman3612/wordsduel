import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { GameParameter } from '@/types/game'

export async function POST(request: NextRequest) {
  try {
    const { word, parameter }: { word: string; parameter: GameParameter } = await request.json()

    // TODO: Implement actual word validation logic
    // This is a placeholder implementation
    const isValid = word.length > 2

    return NextResponse.json({ isValid })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
} 