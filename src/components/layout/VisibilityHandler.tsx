'use client'

import { useEffect } from 'react'

interface VisibilityHandlerProps {
  children: React.ReactNode
}

export function VisibilityHandler({ children }: VisibilityHandlerProps) {
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Only refresh if the page was previously hidden
        if (sessionStorage.getItem('wasHidden') === 'true') {
          window.location.reload()
        }
      } else {
        // Mark that the page was hidden
        sessionStorage.setItem('wasHidden', 'true')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  return children
} 