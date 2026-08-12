export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Goodreads titles typically carry a trailing series annotation like
 * "The Scorch Trials (The Maze Runner, #2)". Open Library's search parser
 * returns zero results for the full string with that suffix attached
 * (confirmed directly against the live API) even though the bare title
 * matches perfectly — so strip it before searching or comparing.
 */
export function stripSeriesSuffix(title: string): string {
  let result = title
  let prev: string
  do {
    prev = result
    result = result.replace(/\s*\([^()]*\)\s*$/, '').trim()
  } while (result !== prev && result.length > 0)
  return result || title
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'with', 'from', 'at', 'by', 'or',
])

function significantTokens(title: string): Set<string> {
  return new Set(normalize(title).split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w)))
}

/**
 * Fraction of the shorter title's distinctive words that also appear in the
 * other title. Two different books by the same author/series (e.g. "The
 * Queen's Assassin" vs "The Queen's Secret") share a leading word or two but
 * diverge on the word that actually distinguishes them — this catches that,
 * unlike a naive "same first word" or substring check.
 */
export function titleConfidence(a: string, b: string): number {
  const ta = significantTokens(a)
  const tb = significantTokens(b)
  if (!ta.size || !tb.size) return 0
  const [smaller, larger] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  let overlap = 0
  for (const t of smaller) if (larger.has(t)) overlap++
  return overlap / smaller.size
}

export const MATCH_THRESHOLD = 0.7

export const AUTHOR_MATCH_THRESHOLD = 0.4

/**
 * A right-looking title isn't enough on its own — generic-sounding titles
 * ("The Queen's Secret") can collide with a completely different book by a
 * different author, and titleConfidence has no way to catch that since it
 * only ever looks at title text. Reuses the same token-overlap approach,
 * just with a much lower bar than the title check: author name variants
 * (pen name vs. legal name, a missing middle name, one word vs. a full
 * name — see "Heather Dixon" vs. Open Library's "Heather Louise Wallwork")
 * are common and shouldn't cause a false rejection the way they would for
 * an exact-title comparison. Skips the check (passes) when either side has
 * no author on file at all — there's nothing to disagree with.
 */
export function authorsAgree(bookAuthors: string[], matchAuthors: string[]): boolean {
  const bookNames = bookAuthors.filter((a) => a.trim())
  const matchNames = matchAuthors.filter((a) => a.trim())
  if (!bookNames.length || !matchNames.length) return true
  return bookNames.some((a) => matchNames.some((b) => titleConfidence(a, b) >= AUTHOR_MATCH_THRESHOLD))
}

export function matchKey(title: string, author: string): string {
  return `${normalize(stripSeriesSuffix(title))}|${normalize(author)}`
}
