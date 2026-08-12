// ─── Auth ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string
}

// ─── Books ───────────────────────────────────────────────────────────────────

export interface Book {
  id: string
  google_books_id: string
  title: string
  authors: string[]
  cover_url: string | null
  description: string | null
  genres: string[]
  page_count: number | null
  published_date: string | null
  isbn: string | null
  publisher: string | null
}

export type ReadingStatus = 'want_to_read' | 'reading' | 'read'

export interface UserBook {
  id: string
  user_id: string
  book_id: string
  status: ReadingStatus
  current_page: number
  date_started: string | null
  date_finished: string | null
  rating: number | null
  review: string | null
  is_favorite: boolean
  created_at: string
  updated_at: string
  book?: Book
}

// ─── Shelves ─────────────────────────────────────────────────────────────────

export interface Shelf {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  folder: string | null
  is_default: boolean
  created_at: string
  book_count?: number
}

export interface ShelfBook {
  id: string
  shelf_id: string
  book_id: string
  user_id: string
  added_at: string
  book?: Book
  user_book?: UserBook
}

// ─── Reading Sessions ─────────────────────────────────────────────────────────

export interface ReadingSession {
  id: string
  user_id: string
  user_book_id: string
  date: string
  pages_read: number
  current_page: number | null
  notes: string | null
  created_at: string
  user_book?: UserBook
}

// ─── Challenges ───────────────────────────────────────────────────────────────

export type ChallengeLength = 'week' | 'month' | 'year' | 'custom'
export type ChallengeStatus = 'active' | 'completed' | 'failed'

export interface Challenge {
  id: string
  user_id: string
  title: string
  description: string | null
  length_type: ChallengeLength
  start_date: string
  end_date: string
  target_count: number
  genre_filter: string | null
  status: ChallengeStatus
  created_at: string
  books_completed?: number
}

export interface ChallengeBook {
  id: string
  challenge_id: string
  user_book_id: string
  user_id: string
  added_at: string
  user_book?: UserBook
}

// ─── Google Books API ─────────────────────────────────────────────────────────

export interface GoogleBooksVolume {
  id: string
  volumeInfo: {
    title: string
    authors?: string[]
    description?: string
    categories?: string[]
    pageCount?: number
    publishedDate?: string
    publisher?: string
    imageLinks?: {
      thumbnail?: string
      smallThumbnail?: string
    }
    industryIdentifiers?: Array<{
      type: string
      identifier: string
    }>
  }
}

export interface GoogleBooksResponse {
  kind: string
  totalItems: number
  items?: GoogleBooksVolume[]
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface ReadingStats {
  totalBooksRead: number
  totalPagesRead: number
  booksThisYear: number
  booksThisMonth: number
  averageRating: number
  currentStreak: number
  longestStreak: number
  genreBreakdown: GenreCount[]
  monthlyReads: MonthlyRead[]
  ratingDistribution: RatingCount[]
}

export interface GenreCount {
  genre: string
  count: number
}

export interface MonthlyRead {
  month: string
  count: number
  pages: number
}

export interface RatingCount {
  rating: number
  count: number
}
