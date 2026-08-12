import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Heart } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Book, UserBook } from '../../types'
import { StarRating } from '../ui/StarRating'
import { Badge } from '../ui/Badge'

const STATUS_LABELS = {
  want_to_read: { label: 'Want to Read', variant: 'info' as const },
  reading: { label: 'Reading', variant: 'success' as const },
  read: { label: 'Read', variant: 'default' as const },
}

interface BookCardProps {
  book: Book
  userBook?: UserBook
  onAdd?: () => void
  compact?: boolean
}

export function BookCard({ book, userBook, onAdd, compact = false }: BookCardProps) {
  const statusInfo = userBook ? STATUS_LABELS[userBook.status] : null
  const qc = useQueryClient()

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!userBook) return
      const { error } = await supabase
        .from('user_books')
        .update({ is_favorite: !userBook.is_favorite })
        .eq('id', userBook.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_books'] })
      qc.invalidateQueries({ queryKey: ['shelf_books'] })
      qc.invalidateQueries({ queryKey: ['user_book'] })
    },
  })

  return (
    <Link
      to={`/books/${book.google_books_id}`}
      className="group bg-white rounded-xl border border-parchment-200 hover:border-primary-300 hover:shadow-md transition-all overflow-hidden flex flex-col"
    >
      <div className={`relative bg-parchment-100 ${compact ? 'h-44' : 'h-56'} overflow-hidden`}>
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={`${book.title} cover`}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-parchment-300 p-4">
            <BookOpen size={40} />
            <p className="text-xs text-center mt-2 text-parchment-400 line-clamp-2">{book.title}</p>
          </div>
        )}
        {statusInfo && (
          <div className="absolute top-2 left-2">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
        )}
        {userBook && (
          <button
            onClick={(e) => { e.preventDefault(); toggleFavorite.mutate() }}
            disabled={toggleFavorite.isPending}
            title={
              toggleFavorite.isError
                ? `Failed: ${toggleFavorite.error instanceof Error ? toggleFavorite.error.message : 'unknown error'}`
                : userBook.is_favorite ? 'Remove from favorites' : 'Add to favorites'
            }
            className={`absolute top-2 right-2 p-1.5 rounded-full bg-white/90 hover:bg-white shadow-sm transition-colors disabled:opacity-50
              ${toggleFavorite.isError ? 'ring-2 ring-red-400' : ''}`}
          >
            <Heart
              size={14}
              className={userBook.is_favorite ? 'fill-red-500 text-red-500' : 'text-gray-400'}
            />
          </button>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1">
        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 leading-snug group-hover:text-primary-700 transition-colors">
          {book.title}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-1">
          {book.authors.join(', ') || 'Unknown Author'}
        </p>

        {userBook?.rating && (
          <div className="mt-auto pt-1">
            <StarRating value={userBook.rating} readonly size={14} />
          </div>
        )}

        {!userBook && onAdd && (
          <button
            onClick={(e) => { e.preventDefault(); onAdd() }}
            className="mt-auto text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors text-left"
          >
            + Add to shelf
          </button>
        )}

        {userBook?.status === 'reading' && userBook.current_page && book.page_count && (
          <div className="mt-1">
            <div className="flex justify-between text-xs text-gray-400 mb-0.5">
              <span>pg {userBook.current_page}</span>
              <span>{Math.round((userBook.current_page / book.page_count) * 100)}%</span>
            </div>
            <div className="h-1 bg-parchment-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full"
                style={{ width: `${Math.min(100, (userBook.current_page / book.page_count) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}
