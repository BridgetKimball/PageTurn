import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Pick<Profile, 'display_name' | 'bio' | 'avatar_url'>>) => Promise<void>
  deleteAccount: () => Promise<{ fullyDeleted: boolean; error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signUp(email: string, password: string, displayName: string) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }

    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        display_name: displayName,
      })
      // Create default shelves
      await supabase.from('shelves').insert([
        { user_id: data.user.id, name: 'Want to Read', color: '#3B82F6', is_default: true },
        { user_id: data.user.id, name: 'Currently Reading', color: '#10B981', is_default: true },
        { user_id: data.user.id, name: 'Read', color: '#8B5CF6', is_default: true },
      ])
    }

    return { error: null }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function updateProfile(updates: Partial<Pick<Profile, 'display_name' | 'bio' | 'avatar_url'>>) {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (data) setProfile(data)
  }

  async function wipeOwnedData(userId: string) {
    // Leaf tables first — safe regardless of whether FK cascades are configured.
    await supabase.from('challenge_books').delete().eq('user_id', userId)
    await supabase.from('shelf_books').delete().eq('user_id', userId)
    await supabase.from('reading_sessions').delete().eq('user_id', userId)
    await supabase.from('challenges').delete().eq('user_id', userId)
    await supabase.from('shelves').delete().eq('user_id', userId)
    await supabase.from('user_books').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)
  }

  async function deleteAccount(): Promise<{ fullyDeleted: boolean; error: string | null }> {
    if (!user) return { fullyDeleted: false, error: 'Not signed in.' }
    const userId = user.id

    // Try the Edge Function first — it deletes the actual auth user, which
    // cascades to everything else. Falls back to a manual data wipe if the
    // function isn't deployed (this app has no server beyond Supabase, so
    // that deployment is a manual step — see docs/DEPLOYMENT.md).
    try {
      const { error } = await supabase.functions.invoke('delete-account')
      if (!error) {
        await supabase.auth.signOut()
        return { fullyDeleted: true, error: null }
      }
    } catch {
      // fall through to manual wipe
    }

    try {
      await wipeOwnedData(userId)
      await supabase.auth.signOut()
      return { fullyDeleted: false, error: null }
    } catch (err) {
      return { fullyDeleted: false, error: err instanceof Error ? err.message : 'Failed to delete account data.' }
    }
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signUp, signIn, signOut, updateProfile, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
