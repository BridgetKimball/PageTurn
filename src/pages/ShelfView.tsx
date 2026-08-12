import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookMarked, Trash2, Filter, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Shelf, ShelfBook } from '../types'
import { BookCard } from '../components/books/BookCard'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { CreateShelfModal } from '../components/shelves/CreateShelfModal'

const PAGE_SIZE = 60

// Cross-shelf query: user can select additional shelves and see their intersection
export function ShelfView() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [crossShelves, setCrossShelves] = useState<string[]>([])
  const [showCreateShelf, setShowCreateShelf] = useState(false)
  const [genreFilter, setGenreFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [id, crossShelves, genreFilter])

  const { data: allShelves = [] } = useQuery<Shelf[]>({
    queryKey: ['shelves', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('shelves').select('*').eq('user_id', user!.id)
      return data ?? []
    },
  })

  const currentShelf = allShelves.find((s) => s.id === id)

  const { data: shelfBooks = [], isLoading, isError } = useQuery<ShelfBook[]>({
    queryKey: ['shelf_books', id, crossShelves, user?.id],
    enabled: !!user && !!id,
    queryFn: async () => {
      // Note: shelf_books has no FK relationship to user_books (only to
      // shelves/books/auth.users), so it can't be embedded in one PostgREST
      // select — fetch user_books separately and merge client-side.
      const { data: rows, error } = await supabase
        .from('shelf_books')
        .select('*, book:books(*)')
        .eq('shelf_id', id)
        .eq('user_id', user!.id)
      if (error) throw error
      if (!rows) return []

      const bookIds = rows.map((r) => r.book_id)
      const { data: userBooks } = bookIds.length
        ? await supabase.from('user_books').select('*').eq('user_id', user!.id).in('book_id', bookIds)
        : { data: [] }
      const userBookByBookId = new Map((userBooks ?? []).map((ub) => [ub.book_id, ub]))
      const data = rows.map((r) => ({ ...r, user_book: userBookByBookId.get(r.book_id) }))

      if (crossShelves.length === 0) return data

      // Cross-shelf intersection: keep only books also in all selected cross shelves
      const crossData = await Promise.all(
        crossShelves.map((sid) =>
          supabase
            .from('shelf_books')
            .select('book_id')
            .eq('shelf_id', sid)
            .eq('user_id', user!.id)
            .then(({ data }) => new Set(data?.map((r) => r.book_id) ?? []))
        )
      )
      return data.filter((sb) => crossData.every((s) => s.has(sb.book_id)))
    },
  })

  const deleteShelf = useMutation({
    mutationFn: async () => {
      await supabase.from('shelves').delete().eq('id', id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shelves'] })
      navigate('/library')
    },
  })

  const toggleCross = (shelfId: string) => {
    setCrossShelves((prev) =>
      prev.includes(shelfId) ? prev.filter((s) => s !== shelfId) : [...prev, shelfId]
    )
  }

  const otherShelves = allShelves.filter((s) => s.id !== id)

  const displayedBooks = shelfBooks.filter((sb) => {
    if (!genreFilter) return true
    const genres = (sb.book as { genres?: string[] } | undefined)?.genres ?? []
    return genres.some((g) => g.toLowerCase().includes(genreFilter.toLowerCase()))
  })

  const allGenres = Array.from(
    new Set(shelfBooks.flatMap((sb) => (sb.book as { genres?: string[] } | undefined)?.genres ?? []))
  ).sort()

  if (!currentShelf && !isLoading) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Shelf not found.</p>
        <Button onClick={() => navigate('/library')} className="mt-4" variant="secondary">Back to Library</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full mt-1" style={{ backgroundColor: currentShelf?.color ?? '#ccc' }} />
          <div>
            <h1 className="text-2xl font-bold font-serif text-gray-900">{currentShelf?.name ?? '…'}</h1>
            {currentShelf?.description && (
              <p className="text-gray-500 text-sm mt-0.5">{currentShelf.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">{displayedBooks.length} books</p>
          </div>
        </div>
        {!currentShelf?.is_default && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm(`Delete shelf "${currentShelf?.name}"? Books won't be removed from your library.`))
                deleteShelf.mutate()
            }}
            loading={deleteShelf.isPending}
          >
            <Trash2 size={14} /> Delete Shelf
          </Button>
        )}
      </div>

      {/* Cross-shelf query panel */}
      <div className="bg-white rounded-xl border border-parchment-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={15} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Cross-Shelf Query</span>
          <span className="text-xs text-gray-400">— show only books that also appear in:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {otherShelves.map((shelf) => (
            <button
              key={shelf.id}
              onClick={() => toggleCross(shelf.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${crossShelves.includes(shelf.id)
                  ? 'text-white border-transparent'
                  : 'border-parchment-200 text-gray-600 hover:bg-parchment-50'}`}
              style={crossShelves.includes(shelf.id) ? { backgroundColor: shelf.color, borderColor: shelf.color } : {}}
            >
              {crossShelves.includes(shelf.id) && <X size={11} />}
              {shelf.name}
            </button>
          ))}
          {otherShelves.length === 0 && (
            <button
              onClick={() => setShowCreateShelf(true)}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"
            >
              <Plus size={13} /> Create another shelf to enable cross-queries
            </button>
          )}
        </div>

        {allGenres.length > 0 && (
          <div className="mt-3 pt-3 border-t border-parchment-100">
            <span className="text-xs text-gray-500 mr-2">Filter by genre:</span>
            <button
              onClick={() => setGenreFilter('')}
              className={`mr-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors
                ${!genreFilter ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-parchment-200 text-gray-500 hover:bg-parchment-50'}`}
            >
              All
            </button>
            {allGenres.slice(0, 8).map((g) => (
              <button
                key={g}
                onClick={() => setGenreFilter(g === genreFilter ? '' : g)}
                className={`mr-1.5 mb-1 px-2.5 py-1 rounded-full text-xs border transition-colors
                  ${genreFilter === g ? 'bg-primary-50 border-primary-500 text-primary-700' : 'border-parchment-200 text-gray-500 hover:bg-parchment-50'}`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {(crossShelves.length > 0 || genreFilter) && (
          <p className="text-xs text-primary-600 mt-2 font-medium">
            Showing {displayedBooks.length} book{displayedBooks.length !== 1 ? 's' : ''} matching all filters
          </p>
        )}
      </div>

      {isError ? (
        <div className="text-center py-16 text-red-500 text-sm">
          Couldn't load this shelf's books. Try refreshing the page.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
      ) : displayedBooks.length === 0 ? (
        <EmptyState
          icon={<BookMarked size={48} />}
          title="No books on this shelf"
          description="Add books from Search or your Library by selecting this shelf."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayedBooks.slice(0, visibleCount).map((sb) => (
              <BookCard key={sb.id} book={sb.book!} userBook={sb.user_book} />
            ))}
          </div>
          {visibleCount < displayedBooks.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Load More ({displayedBooks.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      <CreateShelfModal open={showCreateShelf} onClose={() => setShowCreateShelf(false)} />
    </div>
  )
}
