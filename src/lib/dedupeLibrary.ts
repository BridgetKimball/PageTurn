import { supabase } from './supabase'
import { matchKey as titleAuthorKey } from './titleMatch'
import type { ReadingStatus } from '../types'

export interface DedupeResult {
  groupsMerged: number
  entriesRemoved: number
  mergedTitles: string[]
}

interface BookRow {
  id: string
  title: string
  authors: string[]
  cover_url: string | null
  genres: string[]
  description: string | null
  created_at: string
}

interface UserBookRow {
  id: string
  book_id: string
  status: ReadingStatus
  rating: number | null
  review: string | null
  is_favorite: boolean
  current_page: number
  date_started: string | null
  date_finished: string | null
}

function matchKey(book: BookRow): string {
  return titleAuthorKey(book.title, book.authors[0] ?? '')
}

/** More complete data wins as the surviving record; ties broken by whichever
 * was added first, since that's usually the entry the user interacted with most. */
function pickCanonical(group: BookRow[]): BookRow {
  return [...group].sort((a, b) => {
    const score = (b: BookRow) => (b.cover_url ? 2 : 0) + (b.genres?.length ? 1 : 0) + (b.description ? 1 : 0)
    const diff = score(b) - score(a)
    if (diff !== 0) return diff
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })[0]
}

function statusRank(s: ReadingStatus): number {
  return s === 'read' ? 2 : s === 'reading' ? 1 : 0
}

/** Merges b's fields into a (the row being kept), preferring whichever side
 * has more information rather than blindly picking one copy over the other. */
function mergeUserBookFields(a: UserBookRow, b: UserBookRow) {
  return {
    status: statusRank(b.status) > statusRank(a.status) ? b.status : a.status,
    rating: a.rating ?? b.rating,
    review: a.review ?? b.review,
    is_favorite: a.is_favorite || b.is_favorite,
    current_page: Math.max(a.current_page ?? 0, b.current_page ?? 0),
    date_started: a.date_started ?? b.date_started,
    date_finished: a.date_finished ?? b.date_finished,
  }
}

async function mergeGroup(userId: string, canonicalBookId: string, duplicateBookIds: string[]): Promise<void> {
  const allBookIds = [canonicalBookId, ...duplicateBookIds]

  // Merge user_books: fold every duplicate's row into the canonical one field
  // by field, preferring whichever side has data. Deleting a duplicate's
  // user_books row cascades to its reading_sessions and challenge_books too.
  const { data: ubRows } = await supabase
    .from('user_books')
    .select('*')
    .eq('user_id', userId)
    .in('book_id', allBookIds)

  let canonicalUb = (ubRows ?? []).find((r) => r.book_id === canonicalBookId) as UserBookRow | undefined
  for (const dup of (ubRows ?? []).filter((r) => r.book_id !== canonicalBookId) as UserBookRow[]) {
    if (!canonicalUb) {
      await supabase.from('user_books').update({ book_id: canonicalBookId }).eq('id', dup.id)
      canonicalUb = { ...dup, book_id: canonicalBookId }
    } else {
      const merged = mergeUserBookFields(canonicalUb, dup)
      await supabase.from('user_books').update(merged).eq('id', canonicalUb.id)
      await supabase.from('user_books').delete().eq('id', dup.id)
      canonicalUb = { ...canonicalUb, ...merged }
    }
  }

  // Merge shelf memberships: union of shelves from every duplicate, without
  // violating the (shelf_id, book_id) uniqueness constraint.
  const { data: shelfRows } = await supabase
    .from('shelf_books')
    .select('*')
    .eq('user_id', userId)
    .in('book_id', allBookIds)

  const canonicalShelfIds = new Set(
    (shelfRows ?? []).filter((r) => r.book_id === canonicalBookId).map((r) => r.shelf_id)
  )
  for (const sb of (shelfRows ?? []).filter((r) => r.book_id !== canonicalBookId)) {
    if (canonicalShelfIds.has(sb.shelf_id)) {
      await supabase.from('shelf_books').delete().eq('id', sb.id)
    } else {
      await supabase.from('shelf_books').update({ book_id: canonicalBookId }).eq('id', sb.id)
      canonicalShelfIds.add(sb.shelf_id)
    }
  }

  // The duplicate `books` rows themselves are left in place rather than
  // deleted: that table is shared across all users, and this client has no
  // way to confirm no one else still references them (their own user_books
  // are invisible to us under RLS). They just become unreferenced by this
  // user going forward — harmless, no functional effect on anyone.
}

/**
 * Finds books this user owns more than one copy of (same title + primary
 * author, typically from Goodreads cataloging different editions as
 * separate entries) and merges them into one, keeping the union of ratings/
 * reviews/status/shelf membership rather than discarding either copy's data.
 */
export async function dedupeLibraryBooks(userId: string): Promise<DedupeResult> {
  const { data: ubRows } = await supabase
    .from('user_books')
    .select('book:books(*)')
    .eq('user_id', userId)

  const books = new Map<string, BookRow>()
  for (const row of ubRows ?? []) {
    const book = row.book as unknown as BookRow | null
    if (book && !books.has(book.id)) books.set(book.id, book)
  }

  const groups = new Map<string, BookRow[]>()
  for (const book of books.values()) {
    const key = matchKey(book)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(book)
  }

  let groupsMerged = 0
  let entriesRemoved = 0
  const mergedTitles: string[] = []

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const canonical = pickCanonical(group)
    const duplicates = group.filter((b) => b.id !== canonical.id)

    await mergeGroup(userId, canonical.id, duplicates.map((d) => d.id))

    groupsMerged++
    entriesRemoved += duplicates.length
    mergedTitles.push(`${canonical.title} (${duplicates.length + 1} copies → 1)`)
  }

  return { groupsMerged, entriesRemoved, mergedTitles }
}
