import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User, Mail, Edit3, AlertTriangle, BookOpen, Calendar, CalendarDays, Sparkles, Heart } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { computeReadingStatsSummary } from '../lib/readingStats'
import type { UserBook } from '../types'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { DeleteAccountModal } from '../components/auth/DeleteAccountModal'
import { BookCard } from '../components/books/BookCard'

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-parchment-200 p-4 flex items-center gap-3">
      <div className="p-2 bg-primary-50 rounded-lg text-primary-600 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

export function Profile() {
  const { user, profile, updateProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const { data: userBooks = [] } = useQuery<UserBook[]>({
    queryKey: ['user_books', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_books')
        .select('*, book:books(*)')
        .eq('user_id', user!.id)
      return data ?? []
    },
  })

  const currentlyReading = userBooks.filter((ub) => ub.status === 'reading')
  const favorites = userBooks.filter((ub) => ub.is_favorite)
  const stats = computeReadingStatsSummary(userBooks)

  async function handleSave() {
    setSaving(true)
    await updateProfile({ display_name: displayName, bio })
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold font-serif text-gray-900">Profile</h1>

      <div className="bg-white rounded-xl border border-parchment-200 p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <User size={28} className="text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{profile?.display_name ?? '—'}</h2>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
              <Mail size={13} />
              {profile?.email}
            </div>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <div>
              <label className="text-sm font-medium text-parchment-800 block mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Tell us a bit about yourself and your reading tastes…"
                className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} loading={saving}>Save Changes</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            {profile?.bio && <p className="text-sm text-gray-600">{profile.bio}</p>}
            {!profile?.bio && <p className="text-sm text-gray-400 italic">No bio yet.</p>}
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => {
              setDisplayName(profile?.display_name ?? '')
              setBio(profile?.bio ?? '')
              setEditing(true)
            }}>
              <Edit3 size={13} /> Edit Profile
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={<CalendarDays size={18} />} label="Read this month" value={stats.booksThisMonth} />
        <StatTile icon={<Calendar size={18} />} label="Read this year" value={stats.booksThisYear} />
        <StatTile icon={<Sparkles size={18} />} label="Top genre" value={stats.topGenre ?? '—'} />
        <StatTile icon={<BookOpen size={18} />} label="Member since" value={
          profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'
        } />
      </div>

      {currentlyReading.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Currently Reading</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {currentlyReading.map((ub) => <BookCard key={ub.id} book={ub.book!} userBook={ub} compact />)}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <Heart size={16} className="text-red-500" /> Favorite Books
        </h3>
        {favorites.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {favorites.map((ub) => <BookCard key={ub.id} book={ub.book!} userBook={ub} compact />)}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            No favorites yet — click the heart icon on any book to add one.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h3 className="font-semibold text-red-700 mb-1 flex items-center gap-2">
          <AlertTriangle size={16} /> Danger Zone
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Permanently delete your account and everything in it — books, shelves, reading sessions, and challenges.
          This can't be undone.
        </p>
        <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
          Delete Account
        </Button>
      </div>

      <DeleteAccountModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </div>
  )
}
