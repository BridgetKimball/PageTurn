import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Library as LibraryIcon, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { UserBook, ReadingStatus, Shelf } from '../types'
import { BookCard } from '../components/books/BookCard'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'

const STATUS_TABS: { value: ReadingStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Books' },
  { value: 'reading', label: 'Reading' },
  { value: 'want_to_read', label: 'Want to Read' },
  { value: 'read', label: 'Read' },
]

const PAGE_SIZE = 60

export function Library() {
  const { user } = useAuth()
  const [activeStatus, setActiveStatus] = useState<ReadingStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'added' | 'title' | 'author' | 'rating'>('added')
  const [selectedShelfIds, setSelectedShelfIds] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [activeStatus, search, sortBy, selectedShelfIds])

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

  const { data: shelves = [] } = useQuery<Shelf[]>({
    queryKey: ['shelves', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('shelves')
        .select('*')
        .eq('user_id', user!.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      return data ?? []
    },
  })

  // shelf_books has no FK relationship to user_books (only to shelves/books/
  // auth.users — see CLAUDE.md), so it can't be embedded in the userBooks
  // select above. Fetch shelf membership separately and merge client-side.
  const { data: shelfMemberships = [] } = useQuery<{ book_id: string; shelf_id: string }[]>({
    queryKey: ['shelf_books_membership', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('shelf_books').select('book_id, shelf_id').eq('user_id', user!.id)
      return data ?? []
    },
  })

  const shelfIdsByBookId = new Map<string, Set<string>>()
  for (const { book_id, shelf_id } of shelfMemberships) {
    if (!shelfIdsByBookId.has(book_id)) shelfIdsByBookId.set(book_id, new Set())
    shelfIdsByBookId.get(book_id)!.add(shelf_id)
  }

  function toggleShelf(shelfId: string) {
    setSelectedShelfIds((prev) => (prev.includes(shelfId) ? prev.filter((s) => s !== shelfId) : [...prev, shelfId]))
  }

  const filtered = userBooks
    .filter((ub) => activeStatus === 'all' || ub.status === activeStatus)
    // Same intersection semantics as the Cross-Shelf Query on a shelf's own
    // page: selecting multiple shelves narrows to books on all of them.
    .filter((ub) => selectedShelfIds.length === 0 || selectedShelfIds.every((sid) => shelfIdsByBookId.get(ub.book_id)?.has(sid)))
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
        <div className="flex rounded-lg border border-parchment-200 bg-white overflow-x-auto min-w-0 max-w-full">
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setActiveStatus(value)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap
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

      {shelves.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Shelves:</span>
          {shelves.map((shelf) => (
            <button
              key={shelf.id}
              onClick={() => toggleShelf(shelf.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors
                ${selectedShelfIds.includes(shelf.id)
                  ? 'text-white border-transparent'
                  : 'border-parchment-200 text-gray-600 hover:bg-parchment-50'}`}
              style={selectedShelfIds.includes(shelf.id) ? { backgroundColor: shelf.color, borderColor: shelf.color } : {}}
            >
              {selectedShelfIds.includes(shelf.id) && <X size={11} />}
              {shelf.name}
            </button>
          ))}
          {selectedShelfIds.length > 0 && (
            <button onClick={() => setSelectedShelfIds([])} className="text-xs text-primary-600 hover:text-primary-800 hover:underline ml-1">
              Clear
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon size={48} />}
          title={search || selectedShelfIds.length > 0 ? 'No matching books' : 'Your library is empty'}
          description={
            search || selectedShelfIds.length > 0
              ? 'Try different search terms or shelves.'
              : 'Search for books and add them to your library to get started.'
          }
        />
      ) : (
        <>
          <p className="text-sm text-gray-500">{filtered.length} book{filtered.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.slice(0, visibleCount).map((ub) => (
              <BookCard key={ub.id} book={ub.book!} userBook={ub} />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Load More ({filtered.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
