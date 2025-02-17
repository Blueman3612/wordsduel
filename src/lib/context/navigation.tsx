'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

type Direction = 'forward' | 'backward'

interface NavigationContextType {
  direction: Direction
  setDirection: (direction: Direction) => void
  lastPath: string | null
  setLastPath: (path: string | null) => void
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined)

// Define page hierarchy for determining direction
const pageHierarchy: { [key: string]: number } = {
  '/': 0,
  '/lobbies': 1,
  '/game': 2
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [direction, setDirection] = useState<Direction>('forward')
  const [lastPath, setLastPath] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (lastPath) {
      const lastLevel = pageHierarchy[lastPath.split('/')[1] ? '/' + lastPath.split('/')[1] : '/'] || 0
      const currentLevel = pageHierarchy[pathname.split('/')[1] ? '/' + pathname.split('/')[1] : '/'] || 0
      
      setDirection(currentLevel > lastLevel ? 'forward' : 'backward')
    }
    setLastPath(pathname)
  }, [pathname])

  return (
    <NavigationContext.Provider value={{ direction, setDirection, lastPath, setLastPath }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
} 