'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useRouter } from 'next/navigation'
import { ActionModal } from '@/components/game/ActionModal'
import { supabase } from '@/lib/supabase/client'
import { Github, Mail, LogOut, UserPlus, Camera, Loader2, Gamepad, Users } from 'lucide-react'
import { useAuth } from '@/lib/context/auth'
import { useToast } from '@/lib/context/toast'
import { config } from '@/lib/config'
import { PageTransition } from '@/components/layout/PageTransition'
import Image from 'next/image'

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
  const [profile, setProfile] = useState<{ id: string; display_name: string; avatar_url?: string } | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isQuickPlaying, setIsQuickPlaying] = useState(false)

  // Fetch user profile when user changes
  useEffect(() => {
    async function fetchProfile() {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    try {
      setIsUploading(true)

      // Delete old avatar if it exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/')
        await supabase.storage
          .from('avatars')
          .remove([oldPath])
      }

      // Upload new avatar with consistent name
      const fileExt = file.type.split('/')[1]
      const filePath = `${user.id}/avatar.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { 
          upsert: true,
          contentType: file.type
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) {
        throw updateError
      }

      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : null)
      showToast('Profile picture updated successfully', 'success')
    } catch (error) {
      console.error('Error uploading avatar:', error)
      showToast('Failed to update profile picture', 'error')
    } finally {
      setIsUploading(false)
    }
  }

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

  const handleQuickPlay = async () => {
    if (!user) {
      showToast('Please sign in to play', 'error')
      return
    }

    try {
      setIsQuickPlaying(true)

      // Check if user is already in any lobby
      const { data: existingMembership } = await supabase
        .from('lobby_members')
        .select('lobby_id')
        .eq('user_id', user.id)
        .single()

      if (existingMembership) {
        showToast('You are already in a lobby', 'error')
        router.push('/lobbies')
        return
      }

      // First check if user already has a lobby
      const { data: existingLobby } = await supabase
        .from('lobbies')
        .select('id')
        .eq('host_id', user.id)
        .eq('status', 'waiting')
        .single()

      if (existingLobby) {
        router.push('/lobbies')
        return
      }

      // Look for an available public lobby
      const { data: availableLobby } = await supabase
        .from('lobbies')
        .select('id, max_players')
        .eq('status', 'waiting')
        .is('password', null)
        .order('created_at', { ascending: true })
        .single()

      if (availableLobby) {
        // Check if lobby is full
        const { data: memberCount } = await supabase
          .from('lobby_members')
          .select('count', { count: 'exact' })
          .eq('lobby_id', availableLobby.id)
          .single()

        // Join this lobby
        const { error: joinError } = await supabase
          .from('lobby_members')
          .insert({
            lobby_id: availableLobby.id,
            user_id: user.id
          })

        if (joinError) throw joinError

        // Only redirect to game if the lobby is now full
        if (memberCount && memberCount.count + 1 >= availableLobby.max_players) {
          router.push(`/game/${availableLobby.id}`)
        } else {
          router.push('/lobbies')
        }
        return
      }

      // No available lobbies, create a new one
      const { data: lobby, error: createError } = await supabase
        .from('lobbies')
        .insert({
          name: `${profile?.display_name || user.email?.split('@')[0]}'s Lobby`,
          host_id: user.id,
          max_players: 2,
          password: null
        })
        .select()
        .single()

      if (createError) throw createError

      // Join the lobby as host
      const { error: joinError } = await supabase
        .from('lobby_members')
        .insert({
          lobby_id: lobby.id,
          user_id: user.id
        })

      if (joinError) throw joinError

      // Redirect to lobbies since we just created a new lobby
      router.push('/lobbies')
    } catch (error) {
      console.error('Error during quick play:', error)
      showToast('Failed to start game', 'error')
    } finally {
      setIsQuickPlaying(false)
    }
  }

  return (
    <PageTransition>
      <main className="h-screen overflow-hidden">
        {/* Profile Modal */}
        <ActionModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          word=""
          mode="info"
          title="Profile"
          hideButtons
        >
          <div className="flex flex-col items-center gap-6">
            {/* Profile Picture Section */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-purple-500/80 to-pink-500/80 flex items-center justify-center text-xl font-medium text-white shadow-lg border border-white/10">
                {profile?.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt="Profile"
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (profile?.display_name?.[0] || user?.email?.[0])?.toUpperCase()
                )}
              </div>
              {/* Only show upload button if it's the user's own profile */}
              {user && user.id === profile?.id && (
                <label className="absolute bottom-0 right-0 p-2 bg-white/10 backdrop-blur-md rounded-full cursor-pointer hover:bg-white/20 transition-colors border border-white/10">
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={isUploading}
                  />
                </label>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex flex-col items-center gap-1">
              <h3 className="text-lg font-medium text-white/90">
                {profile?.display_name || user?.email?.split('@')[0]}
              </h3>
              <div className="text-white/50">
                <span className="text-sm">ELO Rating: </span>
                <span className="font-medium">1200</span>
              </div>
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
                  onClick={() => setShowProfileModal(true)}
                  className="bg-white/5 backdrop-blur-md border-white/10 hover:bg-white/10 flex items-center gap-3 px-4 h-[56px]"
                >
                  {/* Profile Picture */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-500/80 to-pink-500/80 flex items-center justify-center text-sm font-medium text-white shadow-lg border border-white/10">
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (profile?.display_name?.[0] || user?.email?.[0])?.toUpperCase()
                    )}
                  </div>
                  {/* Display Name and ELO */}
                  <div className="flex flex-col justify-center text-left">
                    <span className="text-white/90 font-medium leading-tight">
                      {profile?.display_name || user?.email?.split('@')[0]}
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
            
            <div className="flex flex-col gap-4">
              <Button
                onClick={handleQuickPlay}
                disabled={isQuickPlaying}
                className="w-48 flex items-center justify-center gap-2"
              >
                <Gamepad className="w-5 h-5" />
                {isQuickPlaying ? 'Finding Game...' : 'Quick Play'}
              </Button>
              <Button
                onClick={() => router.push('/lobbies')}
                className="w-48 bg-white/10 from-transparent to-transparent hover:bg-white/20 flex items-center justify-center gap-2"
              >
                <Users className="w-5 h-5" />
                Lobbies
              </Button>
            </div>
          </div>
        </div>
      </main>
    </PageTransition>
  )
}
