'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
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

  const handleAuthChange = async (session: Session | null) => {
    if (session?.user) {
      // Check persistence settings
      const shouldPersist = localStorage.getItem('auth_persistence') === 'persist'
      const hasTempSession = sessionStorage.getItem('temp_session') === 'true'
      const isNewPageLoad = !sessionStorage.getItem('app_loaded')
      
      // Set app_loaded flag
      if (isNewPageLoad) {
        sessionStorage.setItem('app_loaded', 'true')
      }

      // Handle non-persistent sessions
      if (isNewPageLoad && !shouldPersist && !hasTempSession) {
        await signOut()
        return
      }

      // Set user state
      setUser(session.user)

      // Handle GitHub profile update
      if (session.user.app_metadata.provider === 'github') {
        const githubUsername = session.user.user_metadata.user_name || session.user.user_metadata.preferred_username
        if (githubUsername) {
          console.log('Setting GitHub username:', githubUsername)
          
          // First check if profile exists
          const { data: existingProfile, error: fetchError } = await supabase
            .from('profiles')
            .select()
            .eq('id', session.user.id)
            .single()

          if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error checking existing profile:', fetchError)
            return
          }

          let error
          if (existingProfile) {
            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                display_name: githubUsername,
                email: session.user.email,
                updated_at: new Date().toISOString()
              })
              .eq('id', session.user.id)
            error = updateError
          } else {
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: session.user.id,
                display_name: githubUsername,
                email: session.user.email,
                updated_at: new Date().toISOString()
              })
            error = insertError
          }

          if (error) {
            console.error('Failed to set display name:', error)
          }
        }
      }
    } else {
      setUser(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange(session)
    })

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session)
    })

    return () => subscription.unsubscribe()
  }, [])

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