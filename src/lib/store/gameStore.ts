import { create } from 'zustand'
import { GameState, GameParameter, Player, GameStatus } from '@/types/game'

interface GameStore extends GameState {
  setGameStatus: (status: GameStatus) => void
  setCurrentParameter: (parameter: GameParameter) => void
  addPlayer: (player: Player) => void
  addUsedWord: (word: string) => void
  setCurrentPlayer: (playerId: string) => void
  setWinner: (playerId: string) => void
  resetGame: () => void
}

const initialState: Omit<GameState, 'id'> = {
  status: 'waiting',
  players: [],
  currentPlayer: '',
  currentParameter: {
    type: 'noun',
    difficulty: 1
  },
  usedWords: [],
  timeLimit: 30
}

type State = GameStore
type SetState = (partial: Partial<State> | ((state: State) => Partial<State>)) => void

export const useGameStore = create<GameStore>((set: SetState) => ({
  ...initialState,
  id: '',
  
  setGameStatus: (status: GameStatus) => set({ status }),
  
  setCurrentParameter: (parameter: GameParameter) => set({ currentParameter: parameter }),
  
  addPlayer: (player: Player) =>
    set((state: State) => ({
      players: [...state.players, player]
    })),
    
  addUsedWord: (word: string) =>
    set((state: State) => ({
      usedWords: [...state.usedWords, word]
    })),
    
  setCurrentPlayer: (playerId: string) => set({ currentPlayer: playerId }),
  
  setWinner: (playerId: string) => set({ winner: playerId, status: 'finished' }),
  
  resetGame: () => set({ ...initialState, id: Math.random().toString() })
})) 