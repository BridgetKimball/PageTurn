import { supabase } from './supabase'
import { searchBooks } from './bookSearch'

export interface BackfillResult {
  total: number
  updated: number
  failed: number
  noMatch: number
  sampleErrors: string[]
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

/**
 * Goodreads titles typically carry a trailing series annotation like
 * "The Scorch Trials (The Maze Runner, #2)". Open Library's search parser
 * returns zero results for the full string with that suffix attached
 * (confirmed directly against the live API) even though the bare title
 * matches perfectly — so strip it before searching.
 */
function stripSeriesSuffix(title: string): string {
  let result = title
  let prev: string
  do {
    prev = result
    result = result.replace(/\s*\([^()]*\)\s*$/, '').trim()
  } while (result !== prev && result.length > 0)
  return result || title
}

function titlesLikelyMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na) || na.split(' ')[0] === nb.split(' ')[0]
}

const CONCURRENCY = 2
const CHUNK_SIZE = 150

async function fetchCandidates(bookIds: string[]): Promise<{ rows: BookRow[]; errors: string[] }> {
  const rows: BookRow[] = []
  const errors: string[] = []
  for (let i = 0; i < bookIds.length; i += CHUNK_SIZE) {
    const chunk = bookIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from('books')
      .select('id, title, authors, cover_url, genres, description, page_count, isbn, publisher')
      .in('id', chunk)
      .is('cover_url', null)
    if (error) errors.push(`Fetching books: ${error.message}`)
    if (data) rows.push(...data)
  }
  return { rows, errors }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Goodreads CSV imports have no cover_url (Goodreads doesn't export one).
 * Look each book missing a cover up via Google Books / Open Library
 * (bookSearch.ts already falls back between the two) and fill in whatever
 * metadata is still blank. Books are shared rows, so this benefits anyone
 * else who has the same book too.
 */
export async function backfillMissingCovers(userId: string, onProgress?: BackfillProgress): Promise<BackfillResult> {
  const { data: ubRows, error: ubError } = await supabase.from('user_books').select('book_id').eq('user_id', userId)
  if (ubError) return { total: 0, updated: 0, failed: 0, noMatch: 0, sampleErrors: [`Loading library: ${ubError.message}`] }

  const bookIds = Array.from(new Set((ubRows ?? []).map((r) => r.book_id)))
  if (!bookIds.length) return { total: 0, updated: 0, failed: 0, noMatch: 0, sampleErrors: [] }

  const { rows: candidates, errors: fetchErrors } = await fetchCandidates(bookIds)
  if (!candidates.length) return { total: 0, updated: 0, failed: 0, noMatch: 0, sampleErrors: fetchErrors }

  let done = 0
  let updated = 0
  let failed = 0
  let noMatch = 0
  const sampleErrors: string[] = [...fetchErrors]

  function recordError(message: string) {
    if (sampleErrors.length < 5 && !sampleErrors.includes(message)) sampleErrors.push(message)
  }

  async function processOne(book: BookRow) {
    try {
      const query = `${stripSeriesSuffix(book.title)} ${book.authors[0] ?? ''}`.trim()
      const results = await searchBooks(query, 5)
      if (!results.length) {
        noMatch++
        return
      }
      // Prefer a result whose title clearly matches; fall back to the
      // top-ranked result rather than giving up entirely, since search
      // APIs already rank by relevance.
      const match = results.find((r) => titlesLikelyMatch(r.title, book.title)) ?? results[0]

      const { error } = await supabase
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

      if (error) {
        failed++
        recordError(`Saving "${book.title}": ${error.message}`)
      } else if (match.cover_url) {
        updated++
      } else {
        noMatch++
      }
    } catch (err) {
      failed++
      recordError(`Searching "${book.title}": ${err instanceof Error ? err.message : 'unknown error'}`)
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
      await delay(150) // stay well under Open Library's rate limit under real browser conditions
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  return { total: candidates.length, updated, failed, noMatch, sampleErrors }
}
