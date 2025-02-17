'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useRouter } from 'next/navigation'
import { ActionModal } from '@/components/game/ActionModal'
import { supabase } from '@/lib/supabase/client'
import { Github, Mail, LogOut, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { config } from '@/lib/config'

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

  return (
    <main className="h-screen overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
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

      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
      
      <div className="relative h-full container mx-auto max-w-4xl">
        {/* Header */}
        <div className="absolute top-0 right-0 p-8">
          {user ? (
            <Button
              onClick={handleSignOut}
              className="bg-white/10 from-transparent to-transparent hover:bg-white/20 flex items-center gap-2"
            >
              <span>Signed In</span>
              <LogOut className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={() => setShowAuthModal(true)}
              className="bg-white/10 from-transparent to-transparent hover:bg-white/20"
            >
              Sign In
            </Button>
          )}
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
  )
}
