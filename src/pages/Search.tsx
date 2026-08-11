import { useState, useCallback, useEffect } from 'react'
import { Search as SearchIcon, X, AlertCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { searchBooks } from '../lib/googleBooks'
import type { Book } from '../types'
import { BookCard } from '../components/books/BookCard'
import { AddToShelfModal } from '../components/books/AddToShelfModal'

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function Search() {
  const [query, setQuery] = useState('')
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const debouncedQuery = useDebounce(query, 400)

  const { data: results = [], isFetching, isError, error } = useQuery({
    queryKey: ['book-search', debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    queryFn: () => searchBooks(debouncedQuery),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })

  const clear = useCallback(() => setQuery(''), [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-gray-900 mb-1">Search Books</h1>
        <p className="text-gray-500 text-sm">Search millions of books from Google Books.</p>
      </div>

      <div className="relative">
        <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, author, or ISBN…"
          className="w-full pl-11 pr-10 py-3 rounded-xl border border-parchment-300 bg-white shadow-sm text-gray-900
            placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          autoFocus
        />
        {query && (
          <button onClick={clear} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        )}
      </div>

      {isFetching && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
      )}

      {isError && (
        <div className="text-center py-16 text-red-500">
          <AlertCircle size={40} className="mx-auto mb-3 opacity-60" />
          <p className="font-medium">Search failed</p>
          <p className="text-sm mt-1 text-red-400 max-w-md mx-auto">
            {error instanceof Error ? error.message : 'Something went wrong contacting Google Books.'}
          </p>
          <p className="text-xs mt-3 text-gray-400 max-w-md mx-auto">
            If this mentions a quota or rate limit, Google's free anonymous search limit has been hit.
            Adding a Google Books API key (VITE_GOOGLE_BOOKS_API_KEY) raises that limit substantially — see docs/SETUP.md.
          </p>
        </div>
      )}

      {!isFetching && !isError && results.length === 0 && debouncedQuery.length >= 2 && (
        <div className="text-center py-16 text-gray-400">
          <SearchIcon size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No results for "{debouncedQuery}"</p>
          <p className="text-sm mt-1">Try different keywords or check your spelling.</p>
        </div>
      )}

      {!isFetching && debouncedQuery.length < 2 && (
        <div className="text-center py-16 text-gray-400">
          <SearchIcon size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Type at least 2 characters to search</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="text-sm text-gray-500">{results.length} results</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map((book) => (
              <BookCard
                key={book.google_books_id}
                book={book}
                onAdd={() => setSelectedBook(book)}
              />
            ))}
          </div>
        </>
      )}

      {selectedBook && (
        <AddToShelfModal
          book={selectedBook}
          open={!!selectedBook}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </div>
  )
}
