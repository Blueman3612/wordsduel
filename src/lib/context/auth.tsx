'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
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

  useEffect(() => {
    // Initialize auth
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      // Check if this is a new page load (not a refresh)
      const isNewPageLoad = !sessionStorage.getItem('app_loaded')
      sessionStorage.setItem('app_loaded', 'true')
      
      if (session) {
        // For non-persistent sessions on a new page load, sign out
        if (isNewPageLoad && !localStorage.getItem('auth_persistence') && !sessionStorage.getItem('temp_session')) {
          await supabase.auth.signOut()
          setUser(null)
        } else {
          setUser(session.user)
          // Set temp session flag if not persistent
          if (!localStorage.getItem('auth_persistence')) {
            sessionStorage.setItem('temp_session', 'true')
          }
        }
      } else {
        setUser(null)
      }
      
      setLoading(false)
    }

    initAuth()

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      localStorage.removeItem('auth_persistence')
      sessionStorage.removeItem('temp_session')
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