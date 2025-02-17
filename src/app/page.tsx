'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useRouter } from 'next/navigation'
import { ActionModal } from '@/components/game/ActionModal'
import { supabase } from '@/lib/supabase/client'
import { Github, Mail, LogOut, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { config } from '@/lib/config'
import { PageTransition } from '@/components/layout/PageTransition'

type AuthMode = 'github' | 'signin' | 'register'

export default function HomePage() {
  const router = useRouter()
  const { user, signOut, setPersistence } = useAuth()
  const { showToast } = useToast()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('github')
  const [emailOrUsername, setEmailOrUsername] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [profile, setProfile] = useState<{ display_name: string } | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [newDisplayName, setNewDisplayName] = useState('')

  // Fetch user profile when user changes
  useEffect(() => {
    async function fetchProfile() {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()
        
        if (error) {
          console.error('Error fetching profile:', error)
          return
        }
        
        if (data) {
          setProfile(data)
        }
      } else {
        setProfile(null)
      }
    }
    
    fetchProfile()
  }, [user])

  const handleGithubLogin = async () => {
    await setPersistence(rememberMe)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${config.baseUrl}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    })
    if (error) {
      showToast(error.message, 'error')
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await setPersistence(rememberMe)
      
      if (authMode === 'signin') {
        // Try to find user by username first
        let email = emailOrUsername
        if (!emailOrUsername.includes('@')) {
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('email')
            .eq('display_name', emailOrUsername)
            .single()
          
          if (profileError || !profiles?.email) {
            showToast('No user found with this username', 'error')
            return
          }
          email = profiles.email
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) {
          showToast(error.message, 'error')
          return
        }
        
        showToast('Successfully signed in!', 'success')
        setShowAuthModal(false)
        resetForm()
      } else if (authMode === 'register') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: emailOrUsername,
          password,
          options: {
            data: {
              display_name: username,
              remember_me: rememberMe
            }
          }
        })
        if (signUpError) {
          showToast(signUpError.message, 'error')
          return
        }

        showToast('Registration successful! Please check your email to verify your account.', 'success')
        setShowAuthModal(false)
        resetForm()
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'An error occurred', 'error')
    }
  }

  const handleSignOut = async () => {
    await signOut()
    showToast('Successfully signed out', 'info')
    router.push('/')
  }

  const resetForm = () => {
    setEmailOrUsername('')
    setPassword('')
    setUsername('')
    setRememberMe(false)
  }

  const handleUpdateProfile = async () => {
    if (!user || !newDisplayName.trim()) return

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: newDisplayName.trim() })
      .eq('id', user.id)

    if (error) {
      showToast('Failed to update profile', 'error')
      return
    }

    setProfile({ display_name: newDisplayName.trim() })
    showToast('Profile updated successfully', 'success')
    setShowProfileModal(false)
  }

  return (
    <PageTransition>
      <main className="h-screen overflow-hidden">
        {/* Profile Edit Modal */}
        <ActionModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          word=""
          mode="info"
          title="Edit Profile"
        >
          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Display Name"
              value={newDisplayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDisplayName(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setShowProfileModal(false)}
                className="bg-white/10 from-transparent to-transparent hover:bg-white/20"
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateProfile}>
                Save Changes
              </Button>
            </div>
          </div>
        </ActionModal>

        {/* Auth Modal */}
        <ActionModal
          isOpen={showAuthModal}
          onClose={() => {
            setShowAuthModal(false)
            resetForm()
          }}
          word=""
          mode="info"
          title="Sign In"
          hideButtons
        >
          <div className="space-y-6">
            {/* Auth Tabs */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
              <button
                onClick={() => {
                  setAuthMode('github')
                  resetForm()
                }}
                className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md transition-colors ${
                  authMode === 'github' ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <Github className="w-5 h-5" />
                <span>GitHub</span>
              </button>
              <button
                onClick={() => {
                  setAuthMode('signin')
                  resetForm()
                }}
                className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md transition-colors ${
                  authMode === 'signin' ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <Mail className="w-5 h-5" />
                <span>Sign In</span>
              </button>
              <button
                onClick={() => {
                  setAuthMode('register')
                  resetForm()
                }}
                className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md transition-colors ${
                  authMode === 'register' ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <UserPlus className="w-5 h-5" />
                <span>Register</span>
              </button>
            </div>

            {/* Auth Content */}
            {authMode === 'github' ? (
              <div className="space-y-4">
                <button
                  onClick={handleGithubLogin}
                  className="w-full p-3 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <Github className="w-5 h-5" />
                  <span>Continue with GitHub</span>
                </button>
                
                <label className="flex items-center gap-2 text-sm text-white/60">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                  />
                  Remember me
                </label>
              </div>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-4 w-full">
                {authMode === 'register' && (
                  <Input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                    required
                    className="w-full"
                  />
                )}
                <Input
                  type={authMode === 'register' ? 'email' : 'text'}
                  placeholder={authMode === 'register' ? 'Email' : 'Email or Username'}
                  value={emailOrUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailOrUsername(e.target.value)}
                  required
                  className="w-full"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  required
                  className="w-full"
                />
                <label className="flex items-center gap-2 text-sm text-white/60">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                  />
                  Remember me
                </label>
                <Button type="submit" className="w-full">
                  {authMode === 'signin' ? 'Sign In' : 'Register'}
                </Button>
              </form>
            )}
          </div>
        </ActionModal>

        <div className="relative h-full container mx-auto max-w-4xl">
          {/* Header */}
          <div className="fixed top-0 right-0 p-4 z-50">
            <div className="flex items-stretch gap-3">
              {user && (
                <Button
                  onClick={() => {
                    setNewDisplayName(profile?.display_name || '')
                    setShowProfileModal(true)
                  }}
                  className="bg-white/5 backdrop-blur-md border-white/10 hover:bg-white/10 flex items-center gap-3 px-4 h-[56px]"
                >
                  {/* Profile Picture - using first letter of display name as fallback */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/80 to-pink-500/80 flex items-center justify-center text-sm font-medium text-white shadow-lg border border-white/10">
                    {(profile?.display_name?.[0] || user.email?.[0])?.toUpperCase()}
                  </div>
                  {/* Display Name and ELO */}
                  <div className="flex flex-col justify-center text-left">
                    <span className="text-white/90 font-medium leading-tight">
                      {profile?.display_name || user.email?.split('@')[0]}
                    </span>
                    <span className="text-white/50 text-sm leading-tight">
                      1200
                    </span>
                  </div>
                </Button>
              )}
              
              {user ? (
                <Button
                  onClick={handleSignOut}
                  className="bg-white/10 from-transparent to-transparent hover:bg-white/20 flex items-center gap-2 h-[56px] px-6"
                >
                  <span>Sign Out</span>
                  <LogOut className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="bg-white/10 from-transparent to-transparent hover:bg-white/20 h-[56px] px-6"
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>

          <div className="h-full flex flex-col items-center justify-center">
            <h1 className="text-7xl font-bold mb-6 text-white tracking-tight">
              Logo
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                bout
              </span>
            </h1>
            <div className="text-2xl text-gray-300 mb-12">
              A battle of words and wit
            </div>
            
            <Button
              onClick={() => router.push('/game')}
              className="w-48"
            >
              Start Game
            </Button>
          </div>
        </div>
      </main>
    </PageTransition>
  )
}
