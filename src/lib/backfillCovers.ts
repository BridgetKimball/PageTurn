import { supabase } from './supabase'
import { searchBooks } from './bookSearch'

export interface BackfillResult {
  total: number
  updated: number
  failed: number
}

export type BackfillProgress = (done: number, total: number) => void

interface BookRow {
  id: string
  title: string
  authors: string[]
  cover_url: string | null
  genres: string[]
  description: string | null
  page_count: number | null
  isbn: string | null
  publisher: string | null
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function titlesLikelyMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na) || na.split(' ')[0] === nb.split(' ')[0]
}

const CONCURRENCY = 4

/**
 * Goodreads CSV imports have no cover_url (Goodreads doesn't export one).
 * Look each book missing a cover up via Google Books / Open Library
 * (bookSearch.ts already falls back between the two) and fill in whatever
 * metadata is still blank. Books are shared rows, so this benefits anyone
 * else who has the same book too.
 */
export async function backfillMissingCovers(userId: string, onProgress?: BackfillProgress): Promise<BackfillResult> {
  const { data: ubRows } = await supabase.from('user_books').select('book_id').eq('user_id', userId)
  const bookIds = Array.from(new Set((ubRows ?? []).map((r) => r.book_id)))
  if (!bookIds.length) return { total: 0, updated: 0, failed: 0 }

  const { data: books } = await supabase
    .from('books')
    .select('id, title, authors, cover_url, genres, description, page_count, isbn, publisher')
    .in('id', bookIds)
    .is('cover_url', null)

  const candidates: BookRow[] = books ?? []
  if (!candidates.length) return { total: 0, updated: 0, failed: 0 }

  let done = 0
  let updated = 0
  let failed = 0

  async function processOne(book: BookRow) {
    try {
      const query = `${book.title} ${book.authors[0] ?? ''}`.trim()
      const results = await searchBooks(query, 5)
      const match = results.find((r) => titlesLikelyMatch(r.title, book.title))
      if (match) {
        await supabase
          .from('books')
          .update({
            cover_url: match.cover_url ?? book.cover_url,
            genres: book.genres?.length ? book.genres : match.genres,
            description: book.description ?? match.description,
            page_count: book.page_count ?? match.page_count,
            isbn: book.isbn ?? match.isbn,
            publisher: book.publisher ?? match.publisher,
          })
          .eq('id', book.id)
        if (match.cover_url) updated++
      }
    } catch {
      failed++
    } finally {
      done++
      onProgress?.(done, candidates.length)
    }
  }

  let index = 0
  async function worker() {
    while (index < candidates.length) {
      const book = candidates[index++]
      await processOne(book)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  return { total: candidates.length, updated, failed }
}
