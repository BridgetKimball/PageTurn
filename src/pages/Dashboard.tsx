import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Star, Trophy, Flame, Target, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { syncExpiredChallenges } from '../lib/challenges'
import type { UserBook, ReadingSession, Challenge } from '../types'
import { BookCard } from '../components/books/BookCard'
import { ChallengeCard } from '../components/challenges/ChallengeCard'

const GENRE_COLORS = [
  '#E35A1F', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16', '#6366F1',
]

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-parchment-200 p-5 flex items-center gap-4">
      <div className="p-3 bg-primary-50 rounded-xl text-primary-600">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export function Dashboard() {
  const { user, profile } = useAuth()
  const [statsPeriod, setStatsPeriod] = useState<'month' | 'year'>('year')

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

  const { data: sessions = [] } = useQuery<ReadingSession[]>({
    queryKey: ['reading_sessions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('reading_sessions')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .limit(365)
      return data ?? []
    },
  })

  const { data: challenges = [] } = useQuery<Challenge[]>({
    queryKey: ['challenges', user?.id],
    enabled: !!user,
    queryFn: async () => {
      await syncExpiredChallenges(user!.id)

      const { data: cData } = await supabase
        .from('challenges')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      if (!cData) return []
      const ids = cData.map((c) => c.id)
      if (!ids.length) return cData.map((c) => ({ ...c, books_completed: 0 }))
      const { data: counts } = await supabase
        .from('challenge_books')
        .select('challenge_id')
        .in('challenge_id', ids)
        .eq('user_id', user!.id)
      return cData.map((c) => ({
        ...c,
        books_completed: counts?.filter((cb) => cb.challenge_id === c.id).length ?? 0,
      }))
    },
  })

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()
  const booksRead = userBooks.filter((ub) => ub.status === 'read')
  // Furthest-along book first; books with no page count (indeterminate
  // progress) sort last rather than tying with a book that's just started.
  function progressOf(ub: UserBook) {
    return ub.book?.page_count ? ub.current_page / ub.book.page_count : -1
  }
  const currentlyReading = userBooks
    .filter((ub) => ub.status === 'reading')
    .sort((a, b) => progressOf(b) - progressOf(a))

  // Stats row scopes to whichever period tab is active; everything else on
  // the page (charts, streak) stays all-time/real-time regardless of tab.
  function inStatsPeriod(dateStr: string | null) {
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (d.getFullYear() !== thisYear) return false
    return statsPeriod === 'year' || d.getMonth() === thisMonth
  }

  const booksReadInPeriod = booksRead.filter((ub) => inStatsPeriod(ub.date_finished))

  // Pages read in the period come from logged reading sessions (so an
  // in-progress book's pages count as soon as they're logged, not only once
  // the book is finished). Books finished in the period but never logged via
  // a session at all (e.g. imported directly, or marked read without ever
  // using Log Session) have no session data to draw from, so those fall back
  // to the book's full page_count — guarded by "no sessions ever", not just
  // "no sessions in period", so a book's pages aren't double-counted once
  // it's being tracked via sessions.
  const bookIdsWithAnySession = new Set(sessions.map((s) => s.user_book_id))
  const sessionsPagesInPeriod = sessions
    .filter((s) => inStatsPeriod(s.date))
    .reduce((sum, s) => sum + (s.pages_read ?? 0), 0)
  const finishedWithoutSessions = booksReadInPeriod.filter((ub) => !bookIdsWithAnySession.has(ub.id))
  const fallbackPages = finishedWithoutSessions.reduce((sum, ub) => sum + (ub.book?.page_count ?? 0), 0)
  const periodPages = sessionsPagesInPeriod + fallbackPages
  const periodRated = booksReadInPeriod.filter((b) => b.rating)
  const periodAvgRating = periodRated.length
    ? (periodRated.reduce((sum, b) => sum + (b.rating ?? 0), 0) / periodRated.length).toFixed(1)
    : '—'

  // Monthly read data for this year
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = new Date(thisYear, i, 1)
    const label = month.toLocaleString('default', { month: 'short' })
    const count = booksRead.filter((ub) => {
      if (!ub.date_finished) return false
      const d = new Date(ub.date_finished)
      return d.getFullYear() === thisYear && d.getMonth() === i
    }).length
    return { month: label, books: count }
  })

  // Genre breakdown
  const genreMap: Record<string, number> = {}
  booksRead.forEach((ub) => {
    const genres = (ub.book as { genres?: string[] } | undefined)?.genres ?? []
    genres.forEach((g) => { genreMap[g] = (genreMap[g] ?? 0) + 1 })
  })
  const genreData = Object.entries(genreMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }))

  // Reading streak
  function computeStreak() {
    const dates = new Set(sessions.map((s) => s.date))
    let streak = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (dates.has(d.toISOString().split('T')[0])) streak++
      else break
    }
    return streak
  }
  const streak = computeStreak()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-serif text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
          {profile?.display_name ?? 'Reader'} 👋
        </h1>
        <p className="text-gray-500 mt-1">Here's your reading overview.</p>
      </div>

      {/* Stats row */}
      <div className="space-y-3">
        <div className="flex w-fit rounded-lg border border-parchment-200 bg-white overflow-x-auto max-w-full">
          {(['month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setStatsPeriod(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap
                ${statsPeriod === p ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-parchment-50'}`}
            >
              {p === 'month' ? 'This Month' : 'This Year'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<BookOpen size={22} />} label="Books Read" value={booksReadInPeriod.length} sub={`${booksRead.length} all-time`} />
          <StatCard icon={<TrendingUp size={22} />} label="Pages Read" value={periodPages.toLocaleString()} />
          <StatCard icon={<Star size={22} />} label="Avg Rating" value={periodAvgRating} />
          <StatCard icon={<Flame size={22} />} label="Day Streak" value={streak} sub={streak > 0 ? 'Keep it up!' : 'Log a session to start'} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-parchment-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Books Read This Year</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="books" fill="#e35a1f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-parchment-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Genre Breakdown</h2>
          {genreData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={genreData} dataKey="value" nameKey="name" cx="35%" cy="50%" outerRadius={70}>
                  {genreData.map((_, i) => (
                    <Cell key={i} fill={GENRE_COLORS[i % GENRE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                {/* Side legend, not below the pie — a bottom legend competes
                    with the pie for the container's vertical space, and with
                    8 (possibly long) genre names wrapping to several rows it
                    could shrink the pie's available area below its fixed
                    outerRadius, clipping or (confirmed while testing) even
                    fully hiding the pie. A side legend only costs horizontal
                    space, which this 2-column layout has plenty of. */}
                <Legend iconSize={10} iconType="circle" layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              No genre data yet
            </div>
          )}
        </div>
      </div>

      {/* Currently Reading */}
      {currentlyReading.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold font-serif text-gray-900">Currently Reading</h2>
            <Link to="/library" className="text-sm text-primary-600 hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {currentlyReading.slice(0, 5).map((ub) => (
              <BookCard key={ub.id} book={ub.book!} userBook={ub} compact />
            ))}
          </div>
        </div>
      )}

      {/* Active Challenges */}
      {challenges.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold font-serif text-gray-900 flex items-center gap-2">
              <Trophy size={18} className="text-amber-500" />
              Active Challenges
            </h2>
            <Link to="/challenges" className="text-sm text-primary-600 hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {challenges.slice(0, 3).map((c) => <ChallengeCard key={c.id} challenge={c} />)}
          </div>
        </div>
      )}

      {/* Empty welcome state */}
      {booksRead.length === 0 && currentlyReading.length === 0 && (
        <div className="bg-white rounded-xl border border-parchment-200 p-10 text-center">
          <BookOpen size={48} className="text-parchment-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Start your reading journey</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto mb-4">
            Search for a book, add it to your library, and begin tracking your reading life.
          </p>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Target size={16} /> Find Your First Book
          </Link>
        </div>
      )}
    </div>
  )
}
