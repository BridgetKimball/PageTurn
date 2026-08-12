import { supabase } from './supabase'
import { parseCsv } from './goodreadsImport'
import { titleConfidence, MATCH_THRESHOLD } from './titleMatch'

export interface CoverPatchResult {
  totalRows: number
  applied: number
  notFound: number
  notFoundTitles: string[]
}

interface PatchRow {
  title: string
  author: string
  coverUrl: string
}

interface ExistingBook {
  id: string
  title: string
  authors: string[]
}

/**
 * A minimal CSV format for applying manually-sourced cover images: just
 * title, optional author, and cover_url — no status/rating/etc. Distinct
 * from both the Goodreads and PageTurn export formats (neither has a bare
 * "cover_url" column without the full book/library schema alongside it).
 */
export function isCoverPatchFormat(headers: string[]): boolean {
  return headers.includes('title') && headers.includes('cover_url') && !headers.includes('status')
}

function parseCoverPatchRows(text: string): PatchRow[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => headers.indexOf(name)
  const idx = { title: col('title'), author: col('author'), coverUrl: col('cover_url') }

  return rows
    .slice(1)
    .map((r) => ({
      title: (idx.title >= 0 ? r[idx.title] : '')?.trim() ?? '',
      author: (idx.author >= 0 ? r[idx.author] : '')?.trim() ?? '',
      coverUrl: (idx.coverUrl >= 0 ? r[idx.coverUrl] : '')?.trim() ?? '',
    }))
    .filter((r) => r.title && r.coverUrl)
}

/**
 * Matches each row against the user's existing library by title + author
 * confidence score (same threshold as the automated backfill) and updates
 * only that book's cover_url — never creates a new book record, so this
 * can't introduce a duplicate the way a full library import could.
 */
export async function applyCoverPatch(userId: string, csvText: string): Promise<CoverPatchResult> {
  const rows = parseCoverPatchRows(csvText)
  const result: CoverPatchResult = { totalRows: rows.length, applied: 0, notFound: 0, notFoundTitles: [] }
  if (!rows.length) return result

  const { data: ubRows } = await supabase.from('user_books').select('book:books(id, title, authors)').eq('user_id', userId)
  const books = new Map<string, ExistingBook>()
  for (const r of ubRows ?? []) {
    const book = r.book as unknown as ExistingBook | null
    if (book) books.set(book.id, book)
  }
  const candidates = Array.from(books.values())

  for (const row of rows) {
    const scored = candidates
      .map((b) => ({
        book: b,
        score: row.author
          ? (titleConfidence(row.title, b.title) + titleConfidence(row.author, b.authors[0] ?? '')) / 2
          : titleConfidence(row.title, b.title),
      }))
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
    if (!best || best.score < MATCH_THRESHOLD) {
      result.notFound++
      if (result.notFoundTitles.length < 15) result.notFoundTitles.push(row.title)
      continue
    }

    const { error } = await supabase.from('books').update({ cover_url: row.coverUrl }).eq('id', best.book.id)
    if (!error) result.applied++
  }

  return result
}
