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
    async function logState(prefix: string) {
      console.group(`${prefix} State Check`)
      
      // Log Auth State
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Auth State:', {
        hasSession: !!session,
        sessionUser: session?.user ? {
          id: session.user.id,
          email: session.user.email,
          metadata: session.user.user_metadata
        } : null,
        contextUser: user ? {
          id: user.id,
          email: user.email,
          metadata: user.user_metadata
        } : null
      })

      // Log Profile Data
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, email')
          .eq('id', user.id)
        console.log('Profile Data:', profile?.[0] || null)
      } else {
        console.log('Profile Data: No user to fetch profile')
      }

      // Log Connection Status
      const channels = supabase.getChannels()
      console.log('Connection Status:', {
        channels: channels.map(ch => ({
          topic: ch.topic,
          state: ch.state
        })),
        totalChannels: channels.length
      })

      console.groupEnd()
    }

    async function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible')
        // Simply refresh the session
        await supabase.auth.refreshSession()
        await logState('After Tab Visible')
      } else {
        console.log('Tab became hidden')
        await logState('Before Tab Hidden')
      }
    }

    // Log initial state
    logState('Initial')

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [user])

  return children
} 