import type { Book } from '../types'
import { fetchWithTimeout } from './fetchWithTimeout'

const BASE_URL = 'https://openlibrary.org'

interface OpenLibraryDoc {
  key: string
  title?: string
  author_name?: string[]
  cover_i?: number
  first_publish_year?: number
  number_of_pages_median?: number
  isbn?: string[]
  subject?: string[]
  publisher?: string[]
}

function olidFromKey(key: string): string {
  return key.split('/').filter(Boolean).pop() ?? key
}

function docToBook(doc: OpenLibraryDoc): Book {
  const olid = olidFromKey(doc.key)
  return {
    id: `openlibrary-${olid}`,
    google_books_id: `openlibrary-${olid}`,
    title: doc.title ?? 'Unknown Title',
    authors: doc.author_name ?? [],
    cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    description: null,
    genres: (doc.subject ?? []).filter((s) => s.length < 40).slice(0, 5),
    page_count: doc.number_of_pages_median ?? null,
    published_date: doc.first_publish_year ? String(doc.first_publish_year) : null,
    isbn: doc.isbn?.[0] ?? null,
    publisher: doc.publisher?.[0] ?? null,
  }
}

export async function searchOpenLibrary(query: string, maxResults = 20): Promise<Book[]> {
  if (!query.trim()) return []

  const params = new URLSearchParams({
    q: query,
    limit: String(maxResults),
    fields: 'key,title,author_name,cover_i,first_publish_year,number_of_pages_median,isbn,subject,publisher',
  })

  const response = await fetchWithTimeout(`${BASE_URL}/search.json?${params}`)
  if (!response.ok) throw new Error(`Open Library API error: ${response.status}`)

  const data: { docs?: OpenLibraryDoc[] } = await response.json()
  return (data.docs ?? []).filter((d) => d.key && d.title).map(docToBook)
}

async function getAuthorNames(authorRefs: { author: { key: string } }[]): Promise<string[]> {
  const names = await Promise.all(
    authorRefs.slice(0, 3).map(async (ref) => {
      try {
        const res = await fetchWithTimeout(`${BASE_URL}${ref.author.key}.json`)
        if (!res.ok) return null
        const data = await res.json()
        return (data.name as string) ?? null
      } catch {
        return null
      }
    })
  )
  return names.filter((n): n is string => !!n)
}

export async function getOpenLibraryBookById(olid: string): Promise<Book | null> {
  const response = await fetchWithTimeout(`${BASE_URL}/works/${olid}.json`)
  if (!response.ok) return null

  const work = await response.json()
  const authors = work.authors ? await getAuthorNames(work.authors) : []
  const description = typeof work.description === 'string' ? work.description : work.description?.value ?? null
  const coverId = (work.covers ?? []).find((c: number) => c > 0)

  return {
    id: `openlibrary-${olid}`,
    google_books_id: `openlibrary-${olid}`,
    title: work.title ?? 'Unknown Title',
    authors,
    cover_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    description,
    genres: (work.subjects ?? []).filter((s: string) => s.length < 40).slice(0, 5),
    page_count: null,
    published_date: work.first_publish_date ?? null,
    isbn: null,
    publisher: null,
  }
}
