import { supabase } from './supabase'

interface ChallengeMatchCandidate {
  id: string
  start_date: string
  end_date: string
  target_count: number
  genre_filter: string | null
}

function genreMatches(genreFilter: string | null, bookGenres: string[]): boolean {
  if (!genreFilter) return true
  const needle = genreFilter.toLowerCase()
  return bookGenres.some((g) => g.toLowerCase().includes(needle) || needle.includes(g.toLowerCase()))
}

/**
 * Keeps challenge_books in sync with a single user_book's current state.
 * Call this any time a book's status, date_finished, or genres could affect
 * challenge eligibility (creating/editing a library entry, CSV import).
 *
 * Idempotent: always clears prior links for this user_book first, then
 * re-links against whatever the book currently qualifies for.
 */
export async function syncChallengeLinksForUserBook(params: {
  userId: string
  userBookId: string
  status: 'want_to_read' | 'reading' | 'read'
  dateFinished: string | null
  genres: string[]
}): Promise<void> {
  const { userId, userBookId, status, dateFinished, genres } = params

  await supabase.from('challenge_books').delete().eq('user_book_id', userBookId).eq('user_id', userId)

  if (status !== 'read' || !dateFinished) return

  const { data: activeChallenges } = await supabase
    .from('challenges')
    .select('id, start_date, end_date, target_count, genre_filter')
    .eq('user_id', userId)
    .eq('status', 'active')

  const candidates = (activeChallenges ?? []) as ChallengeMatchCandidate[]
  const matching = candidates.filter(
    (c) => dateFinished >= c.start_date && dateFinished <= c.end_date && genreMatches(c.genre_filter, genres)
  )
  if (!matching.length) return

  await supabase.from('challenge_books').insert(
    matching.map((c) => ({ challenge_id: c.id, user_book_id: userBookId, user_id: userId }))
  )

  await recomputeChallengeCompletion(userId, matching.map((c) => c.id))
}

/** Marks challenges as 'completed' once they hit their target book count. */
async function recomputeChallengeCompletion(userId: string, challengeIds: string[]): Promise<void> {
  if (!challengeIds.length) return

  const { data: challenges } = await supabase
    .from('challenges')
    .select('id, target_count')
    .in('id', challengeIds)
  if (!challenges?.length) return

  const { data: counts } = await supabase
    .from('challenge_books')
    .select('challenge_id')
    .in('challenge_id', challengeIds)
    .eq('user_id', userId)

  const completedIds = challenges
    .filter((c) => (counts?.filter((cb) => cb.challenge_id === c.id).length ?? 0) >= c.target_count)
    .map((c) => c.id)

  if (completedIds.length) {
    await supabase.from('challenges').update({ status: 'completed' }).in('id', completedIds)
  }
}

/**
 * Lazily sweeps a user's active challenges: anything past its end_date gets
 * marked 'completed' (if it hit target) or 'failed' (if not). Safe to call
 * on every Challenges/Dashboard page load — cheap no-op when nothing's expired.
 */
export async function syncExpiredChallenges(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  const { data: expired } = await supabase
    .from('challenges')
    .select('id, target_count')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('end_date', today)

  if (!expired?.length) return

  const ids = expired.map((c) => c.id)
  const { data: counts } = await supabase
    .from('challenge_books')
    .select('challenge_id')
    .in('challenge_id', ids)
    .eq('user_id', userId)

  const completedIds: string[] = []
  const failedIds: string[] = []
  for (const c of expired) {
    const count = counts?.filter((cb) => cb.challenge_id === c.id).length ?? 0
    if (count >= c.target_count) completedIds.push(c.id)
    else failedIds.push(c.id)
  }

  await Promise.all([
    completedIds.length
      ? supabase.from('challenges').update({ status: 'completed' }).in('id', completedIds)
      : Promise.resolve(),
    failedIds.length
      ? supabase.from('challenges').update({ status: 'failed' }).in('id', failedIds)
      : Promise.resolve(),
  ])
}
