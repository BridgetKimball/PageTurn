import { supabase } from './supabase'
import { searchBooks } from './bookSearch'
import { coverUrlForIsbn } from './openLibrary'
import { stripSeriesSuffix, titleConfidence, authorsAgree, MATCH_THRESHOLD } from './titleMatch'

export type NoMatchReason =
  | 'no_results'
  | 'low_title_confidence'
  | 'author_mismatch'
  | 'no_cover_on_candidate'
  | 'cover_already_used'

export interface NoMatchSample {
  title: string
  searchedAs: string
  resultCount: number
  topResultTitle: string | null
  reason: NoMatchReason
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

const REVALIDATE_CONCURRENCY = 3

/**
 * Repairs damage from an earlier, looser matching heuristic, two ways:
 *
 * 1. Any cover_url shared by more than one of this user's books — a wrong
 *    match can't be correct for both.
 * 2. A book's own cover that matches a search candidate for its own title
 *    with confident title text but a *different* author (see authorsAgree
 *    in titleMatch.ts). This catches matches made before that author check
 *    existed — e.g. "The Queen's Secret" (Melissa de la Cruz) wrongly
 *    carrying Victoria Holt's "The Queen's Secret" cover — where the wrong
 *    cover isn't shared with any other book in this library, so check #1
 *    alone can't see it. Only clears when the *exact* stored cover_url shows
 *    up as one of those bad candidates — never a guess based on title alone.
 *
 * Either way, clearing lets the next backfill re-match with current logic
 * instead of leaving a confidently-wrong cover in place.
 */
export async function deduplicateCovers(userId: string, onProgress?: BackfillProgress): Promise<{ cleared: number }> {
  const { ids: bookIds } = await fetchUserBookIds(userId)
  if (!bookIds.length) return { cleared: 0 }

  const { rows } = await fetchBooksByIds(bookIds, false)

  const countByUrl = new Map<string, number>()
  for (const b of rows) if (b.cover_url) countByUrl.set(b.cover_url, (countByUrl.get(b.cover_url) ?? 0) + 1)
  const sharedIds = new Set(rows.filter((b) => b.cover_url && (countByUrl.get(b.cover_url) ?? 0) > 1).map((b) => b.id))

  const candidates = rows.filter((b) => b.cover_url && !sharedIds.has(b.id))
  const mismatchedIds = new Set<string>()

  let index = 0
  let done = 0
  async function worker() {
    while (index < candidates.length) {
      const book = candidates[index++]
      try {
        const results = await searchBooks(stripSeriesSuffix(book.title), 5)
        const badMatch = results.find(
          (r) =>
            r.cover_url === book.cover_url &&
            titleConfidence(r.title, book.title) >= MATCH_THRESHOLD &&
            !authorsAgree(book.authors, r.authors)
        )
        if (badMatch) mismatchedIds.add(book.id)
      } catch {
        // Can't confirm this one is bad this run — leave its cover alone
        // rather than clearing on an unconfirmed guess.
      }
      done++
      onProgress?.(done, candidates.length)
      await delay(150)
    }
  }
  if (candidates.length) await Promise.all(Array.from({ length: REVALIDATE_CONCURRENCY }, worker))

  const clearIds = [...sharedIds, ...mismatchedIds]
  if (!clearIds.length) return { cleared: 0 }

  await supabase.from('books').update({ cover_url: null }).in('id', clearIds)
  return { cleared: clearIds.length }
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

  const { cleared: duplicatesCleared } = await deduplicateCovers(userId, onProgress)

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

  function isAbortError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
  }

  // fetchWithTimeout's 15s abort is a real, occasional occurrence under
  // sustained concurrent load (confirmed: surfaces as "The operation was
  // aborted." from Open Library specifically — Google Books is 429-dead in
  // this project, so nearly all real traffic goes through Open Library, and
  // bookSearch.ts's Google→OL fallback only wraps the Google call, so an OL
  // abort propagates straight up uncaught). This is transient, not a
  // permanent constraint, so retry a couple of times before giving up.
  async function trySearch(query: string, attempt = 1): Promise<Awaited<ReturnType<typeof searchBooks>>> {
    try {
      return await searchBooks(query, 5)
    } catch (err) {
      if (isAbortError(err) && attempt < 3) {
        await delay(300 * attempt)
        return trySearch(query, attempt + 1)
      }
      throw err
    }
  }

  // A right-looking title isn't sufficient on its own — a generic title
  // ("The Queen's Secret") can collide with a completely different book by
  // a different author. Requires both title confidence AND author agreement
  // before accepting a candidate; `best` (for no-match diagnostics) still
  // reflects the top title-scored result regardless of author outcome.
  // `reason` explains a rejection precisely, rather than one vague catch-all:
  // did nothing clear the title bar at all, or did something clear the
  // title bar but disagree on author?
  function bestMatch(results: Awaited<ReturnType<typeof trySearch>>, title: string, authors: string[]) {
    if (!results.length) return { best: undefined, match: null, reason: 'no_results' as NoMatchReason }
    const scored = results
      .map((r) => ({ result: r, score: titleConfidence(r.title, title) }))
      .sort((a, b) => b.score - a.score)
    const best = scored[0]
    const titleConfident = scored.filter((s) => s.score >= MATCH_THRESHOLD)
    const accepted = titleConfident.find((s) => authorsAgree(authors, s.result.authors))
    const reason: NoMatchReason | null = accepted
      ? null
      : titleConfident.length ? 'author_mismatch' : 'low_title_confidence'
    return { best, match: accepted ? accepted.result : null, reason }
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

      let { best, match, reason } = bestMatch(results, book.title, book.authors)

      // Only fall back to appending the author when the title-only search
      // didn't land a confident match — e.g. a common title shared by
      // several different books, where the author is genuinely needed to
      // find the right one among the top results.
      if (!match && author) {
        const withAuthor = `${strippedTitle} ${author}`.trim()
        const authorResults = await trySearch(withAuthor)
        if (authorResults.length) {
          const authorAttempt = bestMatch(authorResults, book.title, book.authors)
          // The author-appended search is more specific — prefer its verdict
          // over the title-only attempt's whenever it actually found something
          // to judge, even if it still didn't land a confident match.
          if (authorAttempt.best) {
            results = authorResults
            searchedAs = withAuthor
            best = authorAttempt.best
            match = authorAttempt.match
            reason = authorAttempt.reason
          }
        }
      }

      if (match) {
        if (match.cover_url && !assignedCoverUrls.has(match.cover_url)) {
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
        // Title and author both check out, but the candidate itself has
        // no cover image, or another book already claimed this exact one
        // this run — distinct from "couldn't find a confident match" above.
        reason = !match.cover_url ? 'no_cover_on_candidate' : 'cover_already_used'
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

      recordNoMatch({
        title: book.title,
        searchedAs,
        resultCount: results.length,
        topResultTitle: best?.result.title ?? null,
        reason: reason ?? 'no_results',
      })
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
