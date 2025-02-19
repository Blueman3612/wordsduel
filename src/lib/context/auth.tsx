'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

interface Profile {
  id: string
  display_name: string
  avatar_url: string
  email: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  setPersistence: (shouldPersist: boolean) => Promise<void>
}

// Get the initial session synchronously
const getInitialSession = () => {
  try {
    // Check if we have a stored session
    const persistedSession = localStorage.getItem('sb-session')
    if (persistedSession) {
      const session = JSON.parse(persistedSession)
      if (session?.user) {
        return session.user
      }
    }
  } catch (error) {
    console.error('Error getting initial session:', error)
  }
  return null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  setPersistence: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize with stored session
  const [user, setUser] = useState<User | null>(getInitialSession())
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(!user) // Only load if we don't have a user
  const mounted = useRef(false)

  // Keep a ref to the current user to avoid stale closures
  const userRef = useRef<User | null>(null)
  useEffect(() => {
    userRef.current = user
  }, [user])

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, email')
        .eq('id', userId)
        .single()

      if (error) throw error
      if (data) setProfile(data)
    } catch (error) {
      console.error('Error fetching profile:', error)
      setProfile(null)
    }
  }, [])

  // Update profile when user changes
  useEffect(() => {
    if (user?.id) {
      fetchProfile(user.id)
    } else {
      setProfile(null)
    }
  }, [user, fetchProfile])

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

  // Verify and sync session on mount
  useEffect(() => {
    mounted.current = true
    
    async function verifySession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        console.log('Verifying session:', {
          hasStoredUser: !!user,
          hasSession: !!session,
          sessionUser: session?.user?.email
        })
        
        if (session?.user) {
          if (!userRef.current || userRef.current.id !== session.user.id) {
            setUser(session.user)
          }
        } else if (userRef.current) {
          // Clear user if we have no session
          setUser(null)
        }
      } catch (error) {
        console.error('Error verifying session:', error)
      } finally {
        setLoading(false)
      }
    }

    verifySession()
    return () => {
      mounted.current = false
    }
  }, [user])

  // Handle auth state changes
  const handleAuthChange = useCallback(async (event: AuthChangeEvent, session: Session | null) => {
    console.log('Auth state changed:', event, session?.user?.email)
    
    if (mounted.current) {
      if (session?.user) {
        setUser(session.user)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
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
      setProfile(null)
      localStorage.removeItem('auth_persistence')
      sessionStorage.removeItem('temp_session')
      sessionStorage.removeItem('app_loaded')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, setPersistence }}>
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