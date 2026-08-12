import { supabase } from './supabase'
import { searchBooks } from './bookSearch'
import { coverUrlForIsbn } from './openLibrary'
import { stripSeriesSuffix, titleConfidence, MATCH_THRESHOLD } from './titleMatch'

export interface NoMatchSample {
  title: string
  searchedAs: string
  resultCount: number
  topResultTitle: string | null
}

export interface BackfillResult {
  total: number
  updated: number
  failed: number
  noMatch: number
  duplicatesCleared: number
  sampleErrors: string[]
  noMatchSamples: NoMatchSample[]
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

/** For long subtitle-heavy titles ("Title: A Complete Guide to..."), the part
 * before the separator is usually the actual distinctive title — worth a
 * second, narrower search attempt if the full string finds nothing. */
function primaryTitleFragment(title: string): string | null {
  const m = title.match(/^(.+?)\s*(?::|—|–|--|\s-\s)\s+.+$/)
  const fragment = m?.[1]?.trim()
  return fragment && fragment.length >= 3 && fragment !== title ? fragment : null
}

// Open Library responds in 0.5-2.4s under real conditions (confirmed via direct
// testing) but doesn't rate-limit at this volume, so a moderate concurrency is safe.
const CONCURRENCY = 3
const CHUNK_SIZE = 150

async function fetchUserBookIds(userId: string): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supabase.from('user_books').select('book_id').eq('user_id', userId)
  if (error) return { ids: [], error: error.message }
  return { ids: Array.from(new Set((data ?? []).map((r) => r.book_id))), error: null }
}

async function fetchBooksByIds(bookIds: string[], onlyMissingCover: boolean): Promise<{ rows: BookRow[]; errors: string[] }> {
  const rows: BookRow[] = []
  const errors: string[] = []
  for (let i = 0; i < bookIds.length; i += CHUNK_SIZE) {
    const chunk = bookIds.slice(i, i + CHUNK_SIZE)
    let query = supabase
      .from('books')
      .select('id, title, authors, cover_url, genres, description, page_count, isbn, publisher')
      .in('id', chunk)
    if (onlyMissingCover) query = query.is('cover_url', null)
    const { data, error } = await query
    if (error) errors.push(`Fetching books: ${error.message}`)
    if (data) rows.push(...data)
  }
  return { rows, errors }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Repairs damage from an earlier, looser matching heuristic: finds any
 * cover_url shared by more than one of this user's books (a wrong match
 * can't be correct for both) and clears it so the next backfill re-matches
 * them with the stricter logic instead of leaving a confidently-wrong cover.
 */
export async function deduplicateCovers(userId: string): Promise<{ cleared: number }> {
  const { ids: bookIds } = await fetchUserBookIds(userId)
  if (!bookIds.length) return { cleared: 0 }

  const { rows } = await fetchBooksByIds(bookIds, false)
  const countByUrl = new Map<string, number>()
  for (const b of rows) if (b.cover_url) countByUrl.set(b.cover_url, (countByUrl.get(b.cover_url) ?? 0) + 1)

  const duplicateIds = rows.filter((b) => b.cover_url && (countByUrl.get(b.cover_url) ?? 0) > 1).map((b) => b.id)
  if (!duplicateIds.length) return { cleared: 0 }

  await supabase.from('books').update({ cover_url: null }).in('id', duplicateIds)
  return { cleared: duplicateIds.length }
}

/**
 * Goodreads CSV imports have no cover_url (Goodreads doesn't export one).
 * Look each book missing a cover up via Google Books / Open Library
 * (bookSearch.ts already falls back between the two) and fill in whatever
 * metadata is still blank. Books are shared rows, so this benefits anyone
 * else who has the same book too.
 *
 * Always clears existing duplicate covers first (see deduplicateCovers) so
 * a run both repairs past mistakes and avoids making new ones.
 */
export async function backfillMissingCovers(userId: string, onProgress?: BackfillProgress): Promise<BackfillResult> {
  const empty = (extra: Partial<BackfillResult> = {}): BackfillResult => ({
    total: 0, updated: 0, failed: 0, noMatch: 0, duplicatesCleared: 0, sampleErrors: [], noMatchSamples: [], ...extra,
  })

  const { cleared: duplicatesCleared } = await deduplicateCovers(userId)

  const { ids: bookIds, error: ubError } = await fetchUserBookIds(userId)
  if (ubError) return empty({ sampleErrors: [`Loading library: ${ubError}`] })
  if (!bookIds.length) return empty()

  const { rows: candidates, errors: fetchErrors } = await fetchBooksByIds(bookIds, true)
  if (!candidates.length) return empty({ duplicatesCleared, sampleErrors: fetchErrors })

  let done = 0
  let updated = 0
  let failed = 0
  let noMatch = 0
  const sampleErrors: string[] = [...fetchErrors]
  const noMatchSamples: NoMatchSample[] = []
  const assignedCoverUrls = new Set<string>()

  function recordError(message: string) {
    if (sampleErrors.length < 5 && !sampleErrors.includes(message)) sampleErrors.push(message)
  }

  function recordNoMatch(sample: NoMatchSample) {
    noMatch++
    if (noMatchSamples.length < 10) noMatchSamples.push(sample)
  }

  async function trySearch(query: string) {
    return searchBooks(query, 5)
  }

  function bestMatch(results: Awaited<ReturnType<typeof trySearch>>, title: string) {
    const scored = results
      .map((r) => ({ result: r, score: titleConfidence(r.title, title) }))
      .sort((a, b) => b.score - a.score)
    const best = scored[0]
    return { best, match: best && best.score >= MATCH_THRESHOLD ? best.result : null }
  }

  async function processOne(book: BookRow) {
    const strippedTitle = stripSeriesSuffix(book.title)
    const author = book.authors[0] ?? ''

    try {
      // Primary: title alone — the same query the Search Books page effectively
      // runs. Confidence is scored on title text only (never author), so
      // appending the author to the query buys nothing for correctness but
      // can silently zero out real results: Open Library often indexes an
      // author under a different name (pen name vs. legal name, middle
      // initials, joined co-author strings) and treats a multi-term query as
      // an AND, so one mismatched term kills the whole search even when the
      // title matches perfectly. Confirmed directly: "The Enchanted Sonata"
      // alone finds it; adding "Heather Dixon" (vs. Open Library's indexed
      // "Heather Louise Wallwork") returns zero results.
      let results = await trySearch(strippedTitle)
      let searchedAs = strippedTitle

      if (!results.length) {
        const fragment = primaryTitleFragment(strippedTitle)
        if (fragment) {
          const fragmentResults = await trySearch(fragment)
          if (fragmentResults.length) {
            results = fragmentResults
            searchedAs = fragment
          }
        }
      }

      let { best, match } = bestMatch(results, book.title)

      // Only fall back to appending the author when the title-only search
      // didn't land a confident match — e.g. a common title shared by
      // several different books, where the author is genuinely needed to
      // find the right one among the top results.
      if (!match && author) {
        const withAuthor = `${strippedTitle} ${author}`.trim()
        const authorResults = await trySearch(withAuthor)
        if (authorResults.length) {
          const authorAttempt = bestMatch(authorResults, book.title)
          if (authorAttempt.match) {
            results = authorResults
            searchedAs = withAuthor
            best = authorAttempt.best
            match = authorAttempt.match
          }
        }
      }

      if (match && match.cover_url && !assignedCoverUrls.has(match.cover_url)) {
        const { error } = await supabase
          .from('books')
          .update({
            cover_url: match.cover_url,
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
        } else {
          assignedCoverUrls.add(match.cover_url)
          updated++
        }
        return
      }

      // Text search found nothing confident — try a direct ISBN cover lookup.
      // Unambiguous (no title-matching risk), and catches self-published/
      // small-press books that are entirely absent from both catalogs'
      // search index but still have a cover keyed by ISBN.
      if (book.isbn) {
        const isbnCover = await coverUrlForIsbn(book.isbn)
        if (isbnCover && !assignedCoverUrls.has(isbnCover)) {
          const { error } = await supabase.from('books').update({ cover_url: isbnCover }).eq('id', book.id)
          if (error) {
            failed++
            recordError(`Saving "${book.title}": ${error.message}`)
          } else {
            assignedCoverUrls.add(isbnCover)
            updated++
          }
          return
        }
      }

      recordNoMatch({ title: book.title, searchedAs, resultCount: results.length, topResultTitle: best?.result.title ?? null })
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

  return { total: candidates.length, updated, failed, noMatch, duplicatesCleared, sampleErrors, noMatchSamples }
}
