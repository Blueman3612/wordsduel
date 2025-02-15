import { GameParameter } from '@/types/game'

const PARAMETER_TYPES = ['noun', 'verb', 'adjective', 'includes', 'starts_with', 'ends_with'] as const

export function generateParameter(currentDifficulty: number): GameParameter {
  const type = PARAMETER_TYPES[Math.floor(Math.random() * PARAMETER_TYPES.length)]
  let value: string | undefined

  if (type === 'includes' || type === 'starts_with' || type === 'ends_with') {
    // Generate a random letter for these parameter types
    value = String.fromCharCode(97 + Math.floor(Math.random() * 26)) // a-z
  }

  return {
    type,
    value,
    difficulty: currentDifficulty
  }
}

export function getNextDifficulty(currentDifficulty: number): number {
  // Increase difficulty every 5 successful rounds
  if (currentDifficulty % 5 === 0) {
    return currentDifficulty + 1
  }
  return currentDifficulty
} 