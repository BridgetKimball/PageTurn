import type { Book, GoogleBooksResponse, GoogleBooksVolume } from '../types'

const BASE_URL = 'https://www.googleapis.com/books/v1'

function volumeToBook(volume: GoogleBooksVolume): Book {
  const info = volume.volumeInfo
  const isbn = info.industryIdentifiers?.find(
    (id) => id.type === 'ISBN_13' || id.type === 'ISBN_10'
  )?.identifier ?? null

  // Use larger thumbnail and force HTTPS
  const rawCover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null
  const cover = rawCover ? rawCover.replace('http://', 'https://') : null

  return {
    id: volume.id,
    google_books_id: volume.id,
    title: info.title ?? 'Unknown Title',
    authors: info.authors ?? [],
    cover_url: cover,
    description: info.description ?? null,
    genres: info.categories ?? [],
    page_count: info.pageCount ?? null,
    published_date: info.publishedDate ?? null,
    isbn,
    publisher: info.publisher ?? null,
  }
}

export async function searchBooks(query: string, maxResults = 20): Promise<Book[]> {
  if (!query.trim()) return []

  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    printType: 'books',
    langRestrict: 'en',
  })

  const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
  if (apiKey) params.set('key', apiKey)

  const response = await fetch(`${BASE_URL}/volumes?${params}`)
  if (!response.ok) throw new Error(`Google Books API error: ${response.status}`)

  const data: GoogleBooksResponse = await response.json()
  return (data.items ?? []).map(volumeToBook)
}

export async function getBookById(googleBooksId: string): Promise<Book | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
  const params = apiKey ? `?key=${apiKey}` : ''

  const response = await fetch(`${BASE_URL}/volumes/${googleBooksId}${params}`)
  if (!response.ok) return null

  const volume: GoogleBooksVolume = await response.json()
  return volumeToBook(volume)
}
