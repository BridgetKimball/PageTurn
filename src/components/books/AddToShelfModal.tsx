import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Book, Shelf, ReadingStatus } from '../../types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { StarRating } from '../ui/StarRating'

interface AddToShelfModalProps {
  book: Book
  open: boolean
  onClose: () => void
}

const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = [
  { value: 'want_to_read', label: 'Want to Read' },
  { value: 'reading', label: 'Currently Reading' },
  { value: 'read', label: 'Read' },
]

export function AddToShelfModal({ book, open, onClose }: AddToShelfModalProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [status, setStatus] = useState<ReadingStatus>('want_to_read')
  const [rating, setRating] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState('')
  const [selectedShelves, setSelectedShelves] = useState<string[]>([])

  const { data: shelves = [] } = useQuery<Shelf[]>({
    queryKey: ['shelves', user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase.from('shelves').select('*').eq('user_id', user!.id)
      return data ?? []
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      // Upsert book into books table
      await supabase.from('books').upsert({
        google_books_id: book.google_books_id,
        title: book.title,
        authors: book.authors,
        cover_url: book.cover_url,
        description: book.description,
        genres: book.genres,
        page_count: book.page_count,
        published_date: book.published_date,
        isbn: book.isbn,
        publisher: book.publisher,
      }, { onConflict: 'google_books_id' })

      // Get stored book id
      const { data: storedBook } = await supabase
        .from('books')
        .select('id')
        .eq('google_books_id', book.google_books_id)
        .single()
      if (!storedBook) throw new Error('Book not saved')

      // Upsert user_book
      const { data: ub } = await supabase.from('user_books').upsert({
        user_id: user!.id,
        book_id: storedBook.id,
        status,
        rating,
        current_page: currentPage ? parseInt(currentPage) : 0,
        date_started: status === 'reading' ? new Date().toISOString().split('T')[0] : null,
        date_finished: status === 'read' ? new Date().toISOString().split('T')[0] : null,
      }, { onConflict: 'user_id,book_id' }).select('id').single()

      // Add to shelves
      if (selectedShelves.length > 0 && ub) {
        await supabase.from('shelf_books').upsert(
          selectedShelves.map((shelfId) => ({
            shelf_id: shelfId,
            book_id: storedBook.id,
            user_id: user!.id,
          })),
          { onConflict: 'shelf_id,book_id' }
        )
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_books'] })
      qc.invalidateQueries({ queryKey: ['shelves'] })
      qc.invalidateQueries({ queryKey: ['shelf_books'] })
      onClose()
    },
  })

  const toggleShelf = (shelfId: string) => {
    setSelectedShelves((prev) =>
      prev.includes(shelfId) ? prev.filter((id) => id !== shelfId) : [...prev, shelfId]
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to Library" size="md">
      <div className="space-y-5">
        <div className="flex gap-3">
          {book.cover_url && (
            <img src={book.cover_url} alt={book.title} className="w-16 rounded-lg object-cover flex-shrink-0" />
          )}
          <div>
            <h3 className="font-semibold text-gray-900">{book.title}</h3>
            <p className="text-sm text-gray-500">{book.authors.join(', ')}</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Reading Status</p>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatus(value)}
                className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors
                  ${status === value
                    ? 'bg-primary-50 border-primary-500 text-primary-700'
                    : 'border-parchment-200 text-gray-600 hover:bg-parchment-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {status === 'reading' && book.page_count && (
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Current Page</label>
            <input
              type="number"
              min={0}
              max={book.page_count}
              value={currentPage}
              onChange={(e) => setCurrentPage(e.target.value)}
              placeholder={`0 – ${book.page_count}`}
              className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        )}

        {status === 'read' && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Your Rating</p>
            <StarRating value={rating} onChange={setRating} size={24} />
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Add to Shelves</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {shelves.map((shelf) => (
              <button
                key={shelf.id}
                onClick={() => toggleShelf(shelf.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-parchment-50 transition-colors"
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: shelf.color }} />
                <span className="text-sm text-gray-700 flex-1 text-left">{shelf.name}</span>
                {selectedShelves.includes(shelf.id) && <Check size={14} className="text-primary-600" />}
              </button>
            ))}
          </div>
          <button
            onClick={() => {/* handled by parent */}}
            className="mt-2 flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 transition-colors"
          >
            <Plus size={13} /> New shelf
          </button>
        </div>

        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          className="w-full"
        >
          Save to Library
        </Button>
      </div>
    </Modal>
  )
}
