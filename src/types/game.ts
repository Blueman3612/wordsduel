export type GameStatus = 'waiting' | 'playing' | 'finished'

export type Player = {
  id: string
  username: string
  score: number
}

export type GameParameter = {
  type: 'noun' | 'verb' | 'adjective' | 'includes' | 'starts_with' | 'ends_with'
  value?: string
  difficulty: number
}

export type GameState = {
  id: string
  status: GameStatus
  players: Player[]
  currentPlayer: string
  currentParameter: GameParameter
  usedWords: string[]
  timeLimit: number
  winner?: string
}

export type GameMove = {
  playerId: string
  word: string
  timestamp: number
  isValid: boolean
} 