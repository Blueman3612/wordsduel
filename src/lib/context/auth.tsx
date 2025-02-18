'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
  setPersistence: (shouldPersist: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  setPersistence: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const setPersistence = async (shouldPersist: boolean) => {
    try {
      if (shouldPersist) {
        localStorage.setItem('auth_persistence', 'persist')
        sessionStorage.removeItem('temp_session')
      } else {
        localStorage.removeItem('auth_persistence')
        sessionStorage.setItem('temp_session', 'true')
      }
    } catch (error) {
      console.error('Error setting persistence:', error)
    }
  }

  // Handle auth state changes
  const handleAuthChange = useCallback(async (_event: AuthChangeEvent, session: Session | null) => {
    setUser(session?.user ?? null)
    setLoading(false)

    // Create profile if it doesn't exist
    if (session?.user) {
      const { data: existingProfiles, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)

      if (fetchError) {
        console.error('Error checking existing profile:', fetchError)
        return
      }

      if (!existingProfiles || existingProfiles.length === 0) {
        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: session.user.id,
            email: session.user.email,
            display_name: session.user.user_metadata.display_name || session.user.email?.split('@')[0]
          })

        if (createError) {
          console.error('Error creating profile:', createError)
        }
      }
    }
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange)
    return () => {
      subscription.unsubscribe()
    }
  }, [handleAuthChange])

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      localStorage.removeItem('auth_persistence')
      sessionStorage.removeItem('temp_session')
      sessionStorage.removeItem('app_loaded')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut, setPersistence }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 