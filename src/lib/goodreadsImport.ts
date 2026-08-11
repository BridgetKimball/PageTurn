import { supabase } from './supabase'
import { syncChallengeLinksForUserBook } from './challenges'
import type { ReadingStatus } from '../types'

export interface ImportSummary {
  totalRows: number
  imported: number
  skipped: number
  shelvesCreated: number
  errors: string[]
}

// ─── CSV parsing (RFC4180-ish: handles quoted fields, embedded commas/quotes/newlines) ──

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = text.length

  while (i < len) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += char; i++; continue
    }
    if (char === '"') { inQuotes = true; i++; continue }
    if (char === ',') { row.push(field); field = ''; i++; continue }
    if (char === '\r') { i++; continue }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += char; i++
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

// ─── Goodreads-specific field cleanup ──────────────────────────────────────────

function cleanIsbn(v: string): string | null {
  const cleaned = v.replace(/^="?/, '').replace(/"$/, '').trim()
  return cleaned || null
}

function normalizeDate(v: string): string | null {
  const cleaned = v.trim()
  if (!cleaned) return null
  const slashMatch = cleaned.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned
  return null
}

function mapExclusiveShelf(v: string): ReadingStatus {
  const s = v.trim().toLowerCase()
  if (s === 'read') return 'read'
  if (s === 'currently-reading') return 'reading'
  return 'want_to_read'
}

function formatShelfName(slug: string): string {
  return slug
    .trim()
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

const DEFAULT_SHELF_SLUGS = new Set(['to-read', 'currently-reading', 'read'])

interface ParsedRow {
  title: string
  authors: string[]
  isbn: string | null
  pageCount: number | null
  publishedYear: string | null
  rating: number | null
  dateFinished: string | null
  dateAdded: string | null
  review: string | null
  status: ReadingStatus
  customShelfNames: string[]
  googleBooksId: string
}

function parseGoodreadsRows(text: string): ParsedRow[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => headers.indexOf(name)

  const idx = {
    bookId: col('book id'),
    title: col('title'),
    author: col('author'),
    additionalAuthors: col('additional authors'),
    isbn13: col('isbn13'),
    isbn: col('isbn'),
    myRating: col('my rating'),
    pages: col('number of pages'),
    yearPublished: col('year published'),
    dateRead: col('date read'),
    dateAdded: col('date added'),
    bookshelves: col('bookshelves'),
    exclusiveShelf: col('exclusive shelf'),
    myReview: col('my review'),
  }

  if (idx.title === -1) throw new Error('Could not find a "Title" column — is this a Goodreads export?')

  return rows.slice(1).filter((r) => r.length > 1 && r[idx.title]?.trim()).map((r) => {
    const get = (i: number) => (i >= 0 ? r[i] ?? '' : '')

    const title = get(idx.title).trim()
    const author = get(idx.author).trim()
    const additional = get(idx.additionalAuthors).trim()
    const authors = [author, ...(additional ? additional.split(',').map((a) => a.trim()) : [])].filter(Boolean)

    const isbn = cleanIsbn(get(idx.isbn13)) || cleanIsbn(get(idx.isbn))
    const bookId = get(idx.bookId).trim()
    const googleBooksId = `goodreads-${isbn || bookId || hashString(title + '|' + author)}`

    const ratingRaw = parseInt(get(idx.myRating), 10)
    const rating = ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null

    const pagesRaw = parseInt(get(idx.pages), 10)
    const pageCount = Number.isFinite(pagesRaw) && pagesRaw > 0 ? pagesRaw : null

    const status = mapExclusiveShelf(get(idx.exclusiveShelf))
    const dateFinished = status === 'read' ? normalizeDate(get(idx.dateRead)) : null
    const dateAdded = normalizeDate(get(idx.dateAdded))

    const shelvesRaw = get(idx.bookshelves)
    const customShelfNames = shelvesRaw
      ? shelvesRaw.split(',').map((s) => s.trim()).filter((s) => s && !DEFAULT_SHELF_SLUGS.has(s.toLowerCase()))
      : []

    return {
      title,
      authors,
      isbn,
      pageCount,
      publishedYear: get(idx.yearPublished).trim() || null,
      rating,
      dateFinished,
      dateAdded,
      review: get(idx.myReview).trim() || null,
      status,
      customShelfNames: Array.from(new Set(customShelfNames)),
      googleBooksId,
    }
  })
}

// ─── Bulk import ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 200

async function chunked<T, R>(items: T[], fn: (chunk: T[]) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    results.push(await fn(items.slice(i, i + CHUNK_SIZE)))
  }
  return results
}

export async function importGoodreadsCsv(userId: string, csvText: string): Promise<ImportSummary> {
  const parsed = parseGoodreadsRows(csvText)
  const summary: ImportSummary = { totalRows: parsed.length, imported: 0, skipped: 0, shelvesCreated: 0, errors: [] }
  if (!parsed.length) return summary

  // 1. Bulk upsert books, deduped by our synthetic google_books_id
  const uniqueBooks = new Map<string, ParsedRow>()
  for (const row of parsed) if (!uniqueBooks.has(row.googleBooksId)) uniqueBooks.set(row.googleBooksId, row)

  const bookIdMap = new Map<string, string>() // google_books_id -> books.id
  await chunked(Array.from(uniqueBooks.values()), async (chunk) => {
    const { data, error } = await supabase
      .from('books')
      .upsert(
        chunk.map((row) => ({
          google_books_id: row.googleBooksId,
          title: row.title,
          authors: row.authors,
          cover_url: null,
          description: null,
          genres: [],
          page_count: row.pageCount,
          published_date: row.publishedYear,
          isbn: row.isbn,
          publisher: null,
        })),
        { onConflict: 'google_books_id' }
      )
      .select('id, google_books_id')
    if (error) summary.errors.push(`Saving books: ${error.message}`)
    for (const b of data ?? []) bookIdMap.set(b.google_books_id, b.id)
  })

  // 2. Resolve shelves: default 3 + any new custom ones from Bookshelves column
  const { data: existingShelves } = await supabase.from('shelves').select('id, name').eq('user_id', userId)
  const shelfIdByName = new Map<string, string>()
  for (const s of existingShelves ?? []) shelfIdByName.set(s.name.toLowerCase(), s.id)

  const defaultShelfFor: Record<ReadingStatus, string | undefined> = {
    want_to_read: shelfIdByName.get('want to read'),
    reading: shelfIdByName.get('currently reading'),
    read: shelfIdByName.get('read'),
  }

  const neededCustomNames = new Set<string>()
  for (const row of parsed) {
    for (const slug of row.customShelfNames) {
      const formatted = formatShelfName(slug)
      if (!shelfIdByName.has(formatted.toLowerCase())) neededCustomNames.add(formatted)
    }
  }

  if (neededCustomNames.size) {
    const { data: created, error } = await supabase
      .from('shelves')
      .insert(
        Array.from(neededCustomNames).map((name) => ({
          user_id: userId,
          name,
          color: '#9E713D',
          is_default: false,
        }))
      )
      .select('id, name')
    if (error) summary.errors.push(`Creating shelves: ${error.message}`)
    for (const s of created ?? []) shelfIdByName.set(s.name.toLowerCase(), s.id)
    summary.shelvesCreated = created?.length ?? 0
  }

  // 3. Bulk upsert user_books
  const userBookRows = parsed
    .map((row) => ({ row, bookId: bookIdMap.get(row.googleBooksId) }))
    .filter((r): r is { row: ParsedRow; bookId: string } => {
      if (!r.bookId) { summary.errors.push(`Skipped "${r.row.title}" — book record failed to save.`); return false }
      return true
    })

  const userBookIdByBookId = new Map<string, string>()
  await chunked(userBookRows, async (chunk) => {
    const { data, error } = await supabase
      .from('user_books')
      .upsert(
        chunk.map(({ row, bookId }) => ({
          user_id: userId,
          book_id: bookId,
          status: row.status,
          rating: row.rating,
          current_page: 0,
          date_started: null,
          date_finished: row.dateFinished,
          review: row.review,
        })),
        { onConflict: 'user_id,book_id' }
      )
      .select('id, book_id')
    if (error) summary.errors.push(`Saving library entries: ${error.message}`)
    for (const ub of data ?? []) userBookIdByBookId.set(ub.book_id, ub.id)
  })

  // 4. Bulk link shelf_books: default shelf per status + any custom shelves
  const shelfBookRows: { shelf_id: string; book_id: string; user_id: string }[] = []
  for (const { row, bookId } of userBookRows) {
    const defaultShelfId = defaultShelfFor[row.status]
    if (defaultShelfId) shelfBookRows.push({ shelf_id: defaultShelfId, book_id: bookId, user_id: userId })
    for (const slug of row.customShelfNames) {
      const shelfId = shelfIdByName.get(formatShelfName(slug).toLowerCase())
      if (shelfId) shelfBookRows.push({ shelf_id: shelfId, book_id: bookId, user_id: userId })
    }
  }
  const dedupedShelfBooks = Array.from(
    new Map(shelfBookRows.map((r) => [`${r.shelf_id}:${r.book_id}`, r])).values()
  )
  await chunked(dedupedShelfBooks, async (chunk) => {
    const { error } = await supabase.from('shelf_books').upsert(chunk, { onConflict: 'shelf_id,book_id' })
    if (error) summary.errors.push(`Linking shelves: ${error.message}`)
  })

  // 5. Sync challenge progress for any books marked 'read'
  for (const { row, bookId } of userBookRows) {
    if (row.status !== 'read') continue
    const userBookId = userBookIdByBookId.get(bookId)
    if (!userBookId) continue
    try {
      await syncChallengeLinksForUserBook({
        userId,
        userBookId,
        status: 'read',
        dateFinished: row.dateFinished,
        genres: [],
      })
    } catch {
      // Non-fatal — challenge linking is a bonus, don't fail the whole import over it.
    }
  }

  summary.imported = userBookRows.length
  summary.skipped = summary.totalRows - summary.imported
  return summary
}
