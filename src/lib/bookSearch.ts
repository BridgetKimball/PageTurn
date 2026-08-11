import type { Book } from '../types'
import { searchBooks as searchGoogleBooks, getBookById as getGoogleBookById } from './googleBooks'
import { searchOpenLibrary, getOpenLibraryBookById } from './openLibrary'

/**
 * Google Books is tried first (richer metadata when it works), but its
 * anonymous quota is shared globally and can hit zero with no warning.
 * Open Library needs no API key and has its own separate, generous quota,
 * so it's a safe automatic fallback rather than a second point of failure.
 */
export async function searchBooks(query: string, maxResults = 20): Promise<Book[]> {
  if (!query.trim()) return []
  try {
    return await searchGoogleBooks(query, maxResults)
  } catch {
    return await searchOpenLibrary(query, maxResults)
  }
}

export async function getBookById(id: string): Promise<Book | null> {
  if (id.startsWith('openlibrary-')) {
    return getOpenLibraryBookById(id.replace('openlibrary-', ''))
  }
  try {
    return await getGoogleBookById(id)
  } catch {
    return null
  }
}
