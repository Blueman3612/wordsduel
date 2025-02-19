'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth'

interface VisibilityHandlerProps {
  children: React.ReactNode
}

export function VisibilityHandler({ children }: VisibilityHandlerProps) {
  const { user } = useAuth()

  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        await supabase.auth.refreshSession()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [user])

  return children
} 