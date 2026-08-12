/**
 * A hung request (rather than a fast HTTP error) would otherwise stall an
 * entire batch operation like the cover backfill. Cap every external API
 * call so a slow/dead endpoint fails fast instead of hanging indefinitely.
 */
export function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}
