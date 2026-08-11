import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Library as LibraryIcon, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { UserBook, ReadingStatus } from '../types'
import { BookCard } from '../components/books/BookCard'
import { EmptyState } from '../components/ui/EmptyState'

const STATUS_TABS: { value: ReadingStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Books' },
  { value: 'reading', label: 'Reading' },
  { value: 'want_to_read', label: 'Want to Read' },
  { value: 'read', label: 'Read' },
]

export function Library() {
  const { user } = useAuth()
  const [activeStatus, setActiveStatus] = useState<ReadingStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'added' | 'title' | 'author' | 'rating'>('added')

  const { data: userBooks = [], isLoading } = useQuery<UserBook[]>({
    queryKey: ['user_books', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_books')
        .select('*, book:books(*)')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
      return data ?? []
    },
  })

  const filtered = userBooks
    .filter((ub) => activeStatus === 'all' || ub.status === activeStatus)
    .filter((ub) => {
      if (!search) return true
      const q = search.toLowerCase()
      const b = ub.book
      return (
        b?.title.toLowerCase().includes(q) ||
        b?.authors.some((a) => a.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => {
      if (sortBy === 'title') return (a.book?.title ?? '').localeCompare(b.book?.title ?? '')
      if (sortBy === 'author') return (a.book?.authors[0] ?? '').localeCompare(b.book?.authors[0] ?? '')
      if (sortBy === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-gray-900 mb-1">My Library</h1>
        <p className="text-gray-500 text-sm">{userBooks.length} books total</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-parchment-200 bg-white overflow-hidden">
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setActiveStatus(value)}
              className={`px-4 py-2 text-sm font-medium transition-colors
                ${activeStatus === value
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-parchment-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title or author…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-parchment-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 text-sm rounded-lg border border-parchment-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        >
          <option value="added">Sort: Recently Added</option>
          <option value="title">Sort: Title A–Z</option>
          <option value="author">Sort: Author A–Z</option>
          <option value="rating">Sort: Rating</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon size={48} />}
          title={search ? 'No matching books' : 'Your library is empty'}
          description={search ? 'Try different search terms.' : 'Search for books and add them to your library to get started.'}
        />
      ) : (
        <>
          <p className="text-sm text-gray-500">{filtered.length} book{filtered.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((ub) => (
              <BookCard key={ub.id} book={ub.book!} userBook={ub} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
