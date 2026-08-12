import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, ChevronLeft, Calendar, BookMarked, Edit3, Plus, Heart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBookById } from '../lib/bookSearch'
import type { Book, UserBook, ReadingSession, Shelf } from '../types'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { AddToShelfModal } from '../components/books/AddToShelfModal'

const STATUS_LABELS = {
  want_to_read: 'Want to Read',
  reading: 'Currently Reading',
  read: 'Read',
}

export function BookDetail() {
  const { googleBooksId } = useParams<{ googleBooksId: string }>()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [sessionCurrentPage, setSessionCurrentPage] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [editReview, setEditReview] = useState(false)
  const [reviewText, setReviewText] = useState('')

  // A book already in our own database (added via Search, or via CSV import)
  // has everything we need without touching the Google Books API at all —
  // which matters both for CSV-imported books (their id is a synthetic
  // "goodreads-..." id Google has never heard of) and for anonymous API
  // quota limits. Only fall back to a live fetch for a not-yet-added book.
  const { data: storedBook, isFetched: storedBookFetched } = useQuery<(Book & { id: string }) | null>({
    queryKey: ['stored_book', googleBooksId],
    enabled: !!googleBooksId,
    queryFn: async () => {
      const { data } = await supabase.from('books').select('*').eq('google_books_id', googleBooksId).maybeSingle()
      return data
    },
  })

  const { data: liveBook, isFetched: liveBookFetched } = useQuery<Book | null>({
    queryKey: ['live_book', googleBooksId],
    enabled: !!googleBooksId && storedBookFetched && !storedBook,
    queryFn: () => getBookById(googleBooksId!),
  })

  const book = storedBook ?? liveBook

  const { data: userBook } = useQuery<UserBook | null>({
    queryKey: ['user_book', storedBook?.id, user?.id],
    enabled: !!user && !!storedBook?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_books')
        .select('*')
        .eq('user_id', user!.id)
        .eq('book_id', storedBook!.id)
        .maybeSingle()
      return data
    },
  })

  const { data: sessions = [] } = useQuery<ReadingSession[]>({
    queryKey: ['reading_sessions_book', userBook?.id],
    enabled: !!userBook?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('reading_sessions')
        .select('*')
        .eq('user_book_id', userBook!.id)
        .order('date', { ascending: false })
      return data ?? []
    },
  })

  const { data: bookShelves = [] } = useQuery<Shelf[]>({
    queryKey: ['book_shelves', storedBook?.id, user?.id],
    enabled: !!user && !!storedBook?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('shelf_books')
        .select('shelf:shelves(*)')
        .eq('book_id', storedBook!.id)
        .eq('user_id', user!.id)
      return (data?.map((r) => r.shelf).filter(Boolean) ?? []) as unknown as Shelf[]
    },
  })

  const logSession = useMutation({
    mutationFn: async () => {
      const previousPage = userBook?.current_page ?? 0
      let newPage = parseInt(sessionCurrentPage)
      if (book?.page_count) newPage = Math.min(newPage, book.page_count)
      const pagesRead = Math.max(0, newPage - previousPage)

      await supabase.from('reading_sessions').insert({
        user_id: user!.id,
        user_book_id: userBook!.id,
        date: sessionDate,
        pages_read: pagesRead,
        notes: sessionNotes || null,
      })
      if (userBook) {
        await supabase
          .from('user_books')
          .update({ current_page: newPage })
          .eq('id', userBook.id)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reading_sessions_book'] })
      qc.invalidateQueries({ queryKey: ['user_book'] })
      qc.invalidateQueries({ queryKey: ['reading_sessions'] })
      setShowSessionModal(false)
      setSessionCurrentPage(''); setSessionNotes('')
    },
  })

  const saveReview = useMutation({
    mutationFn: async () => {
      await supabase
        .from('user_books')
        .update({ review: reviewText })
        .eq('id', userBook!.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_book'] })
      setEditReview(false)
    },
  })

  const updateRating = useMutation({
    mutationFn: async (rating: number) => {
      await supabase.from('user_books').update({ rating }).eq('id', userBook!.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_book'] }),
  })

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('user_books')
        .update({ is_favorite: !userBook!.is_favorite })
        .eq('id', userBook!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_book'] })
      qc.invalidateQueries({ queryKey: ['user_books'] })
    },
  })

  const settledWithNoBook = storedBookFetched && !storedBook && liveBookFetched && !liveBook

  if (settledWithNoBook) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen size={40} className="text-parchment-300 mb-3" />
        <p className="text-gray-600 font-medium">Couldn't load this book</p>
        <p className="text-sm text-gray-400 mt-1 max-w-sm">
          Its source may be unavailable right now, or the link is out of date.
        </p>
        <Link to="/library" className="mt-4 text-sm text-primary-600 hover:underline">Back to Library</Link>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full" />
      </div>
    )
  }

  const totalPagesRead = sessions.reduce((sum, s) => sum + (s.pages_read ?? 0), 0)

  const sessionPreviewPage = parseInt(sessionCurrentPage)
  const sessionPreviewPercent =
    book.page_count && !isNaN(sessionPreviewPage)
      ? Math.min(100, Math.max(0, Math.round((sessionPreviewPage / book.page_count) * 100)))
      : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/library" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ChevronLeft size={16} /> Back to Library
      </Link>

      <div className="bg-white rounded-2xl border border-parchment-200 overflow-hidden">
        {/* Header */}
        <div className="flex gap-6 p-6">
          <div className="flex-shrink-0">
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-36 rounded-xl shadow-md object-cover" />
            ) : (
              <div className="w-36 h-52 bg-parchment-100 rounded-xl flex items-center justify-center">
                <BookOpen size={40} className="text-parchment-300" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold font-serif text-gray-900 mb-1">{book.title}</h1>
            <p className="text-gray-500 mb-3">{book.authors.join(', ')}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {book.genres.slice(0, 4).map((g) => (
                <Badge key={g}>{g}</Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
              {book.page_count && <span>{book.page_count} pages</span>}
              {book.published_date && <span>{book.published_date.slice(0, 4)}</span>}
              {book.publisher && <span>{book.publisher}</span>}
            </div>

            {userBook ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant={userBook.status === 'read' ? 'default' : userBook.status === 'reading' ? 'success' : 'info'}>
                    {STATUS_LABELS[userBook.status]}
                  </Badge>
                  <Button size="sm" variant="secondary" onClick={() => setShowAddModal(true)}>
                    <Edit3 size={13} /> Edit
                  </Button>
                  <button
                    onClick={() => toggleFavorite.mutate()}
                    disabled={toggleFavorite.isPending}
                    title={
                      toggleFavorite.isError
                        ? `Failed: ${toggleFavorite.error instanceof Error ? toggleFavorite.error.message : 'unknown error'}`
                        : userBook.is_favorite ? 'Remove from favorites' : 'Add to favorites'
                    }
                    className={`p-2 rounded-lg border transition-colors disabled:opacity-50
                      ${toggleFavorite.isError ? 'border-red-400 ring-2 ring-red-200' : 'border-parchment-200 hover:bg-parchment-50'}`}
                  >
                    <Heart size={15} className={userBook.is_favorite ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
                  </button>
                  {toggleFavorite.isError && (
                    <span className="text-xs text-red-500">
                      Couldn't save — did you run the is_favorite migration? See docs/MIGRATIONS.md.
                    </span>
                  )}
                </div>
                {userBook.status === 'reading' && book.page_count && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Page {userBook.current_page} of {book.page_count}</span>
                      <span>{Math.round((userBook.current_page / book.page_count) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-parchment-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${Math.min(100, (userBook.current_page / book.page_count) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                <StarRating value={userBook.rating} onChange={(r) => updateRating.mutate(r)} size={22} />
              </div>
            ) : (
              <Button onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> Add to Library
              </Button>
            )}
          </div>
        </div>

        {/* Description */}
        {book.description && (
          <div className="px-6 pb-6 border-t border-parchment-100 pt-4">
            <h2 className="font-semibold text-gray-800 mb-2">About this book</h2>
            <p className="text-sm text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: book.description }} />
          </div>
        )}
      </div>

      {userBook && (
        <>
          {/* Shelves */}
          {bookShelves.length > 0 && (
            <div className="bg-white rounded-xl border border-parchment-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <BookMarked size={16} className="text-gray-400" /> On Shelves
              </h2>
              <div className="flex flex-wrap gap-2">
                {bookShelves.map((shelf) => (
                  <Link
                    key={shelf.id}
                    to={`/shelves/${shelf.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-parchment-200 hover:border-primary-300 transition-colors"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: shelf.color }} />
                    {shelf.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Personal Review */}
          <div className="bg-white rounded-xl border border-parchment-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">My Notes & Review</h2>
              {!editReview && (
                <Button size="sm" variant="ghost" onClick={() => { setReviewText(userBook.review ?? ''); setEditReview(true) }}>
                  <Edit3 size={13} /> {userBook.review ? 'Edit' : 'Add Note'}
                </Button>
              )}
            </div>
            {editReview ? (
              <div className="space-y-3">
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={4}
                  placeholder="Write your thoughts, highlights, or review…"
                  className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveReview.mutate()} loading={saveReview.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditReview(false)}>Cancel</Button>
                </div>
              </div>
            ) : userBook.review ? (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{userBook.review}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No notes yet.</p>
            )}
          </div>

          {/* Reading Sessions */}
          <div className="bg-white rounded-xl border border-parchment-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Calendar size={16} className="text-gray-400" /> Reading Sessions
                <span className="text-sm font-normal text-gray-400">({totalPagesRead} pages total)</span>
              </h2>
              {userBook.status === 'reading' && (
                <Button size="sm" onClick={() => {
                  setSessionCurrentPage(userBook.current_page ? String(userBook.current_page) : '')
                  setShowSessionModal(true)
                }}>
                  <Plus size={13} /> Log Session
                </Button>
              )}
            </div>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No sessions logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-start justify-between py-2 border-b border-parchment-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{s.pages_read} pages</p>
                      {s.notes && <p className="text-xs text-gray-500 mt-0.5">{s.notes}</p>}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                      {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Log Session Modal */}
      <Modal open={showSessionModal} onClose={() => setShowSessionModal(false)} title="Log Reading Session" size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Current Page</label>
            <input
              type="number"
              min={1}
              max={book.page_count ?? undefined}
              value={sessionCurrentPage}
              onChange={(e) => setSessionCurrentPage(e.target.value)}
              placeholder="What page are you on?"
              className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            {sessionPreviewPercent !== null && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Page {sessionPreviewPage} of {book.page_count}</span>
                  <span>{sessionPreviewPercent}%</span>
                </div>
                <div className="h-2 bg-parchment-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${sessionPreviewPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Notes (optional)</label>
            <textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              rows={3}
              placeholder="Quick thoughts from this session…"
              className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowSessionModal(false)} className="flex-1">Cancel</Button>
            <Button onClick={() => logSession.mutate()} loading={logSession.isPending} disabled={!sessionCurrentPage} className="flex-1">
              Save Session
            </Button>
          </div>
        </div>
      </Modal>

      <AddToShelfModal
        book={book}
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        existingUserBook={userBook}
        initialShelfIds={bookShelves.map((s) => s.id)}
      />
    </div>
  )
}
