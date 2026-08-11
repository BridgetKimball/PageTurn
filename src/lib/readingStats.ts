import type { UserBook } from '../types'

export interface ReadingStatsSummary {
  booksThisYear: number
  booksThisMonth: number
  topGenre: string | null
}

export function computeReadingStatsSummary(userBooks: UserBook[]): ReadingStatsSummary {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const read = userBooks.filter((ub) => ub.status === 'read' && ub.date_finished)
  const finishedThisYear = read.filter((ub) => new Date(ub.date_finished!).getFullYear() === year)
  const finishedThisMonth = finishedThisYear.filter((ub) => new Date(ub.date_finished!).getMonth() === month)

  const genreCounts: Record<string, number> = {}
  for (const ub of read) {
    const genres = ub.book?.genres ?? []
    for (const g of genres) genreCounts[g] = (genreCounts[g] ?? 0) + 1
  }
  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    booksThisYear: finishedThisYear.length,
    booksThisMonth: finishedThisMonth.length,
    topGenre,
  }
}
