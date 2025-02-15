import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { GameParameter } from '@/types/game'
import { validateWord } from '@/lib/utils/dictionary'

export async function POST(request: NextRequest) {
  try {
    const { word, parameter }: { word: string; parameter: GameParameter } = await request.json()

    if (!word || !parameter) {
      return NextResponse.json({ error: 'Missing word or parameter' }, { status: 400 })
    }

    const isValid = await validateWord(word.toLowerCase(), parameter)
    return NextResponse.json({ isValid })
  } catch (error) {
    console.error('Error in validation endpoint:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
} 