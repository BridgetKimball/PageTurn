import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Upload, FileText, AlertCircle, CheckCircle2, ImageOff, Copy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { importGoodreadsCsv, type ImportSummary } from '../lib/goodreadsImport'
import { backfillMissingCovers, type BackfillResult } from '../lib/backfillCovers'
import { dedupeLibraryBooks, type DedupeResult } from '../lib/dedupeLibrary'
import type { UserBook } from '../types'
import { Button } from '../components/ui/Button'

function toCSV(rows: Record<string, string | number | null>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const v = row[h]
        if (v === null || v === undefined) return ''
        const str = String(v)
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(',')
    ),
  ]
  return lines.join('\n')
}

export function ImportExport() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [backfillProgress, setBackfillProgress] = useState({ done: 0, total: 0 })
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null)
  const [dedupeStatus, setDedupeStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [dedupeResult, setDedupeResult] = useState<DedupeResult | null>(null)

  const { data: userBooks = [] } = useQuery<UserBook[]>({
    queryKey: ['user_books', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_books')
        .select('*, book:books(*)')
        .eq('user_id', user!.id)
      return data ?? []
    },
  })

  async function handleExport() {
    setExportLoading(true)
    const rows = userBooks.map((ub) => ({
      title: ub.book?.title ?? '',
      authors: ub.book?.authors.join('; ') ?? '',
      status: ub.status,
      rating: ub.rating ?? '',
      is_favorite: ub.is_favorite ? 'true' : '',
      current_page: ub.current_page ?? '',
      page_count: ub.book?.page_count ?? '',
      date_started: ub.date_started ?? '',
      date_finished: ub.date_finished ?? '',
      genres: ub.book?.genres.join('; ') ?? '',
      review: ub.review ?? '',
      isbn: ub.book?.isbn ?? '',
      publisher: ub.book?.publisher ?? '',
      cover_url: ub.book?.cover_url ?? '',
      description: ub.book?.description ?? '',
      google_books_id: ub.book?.google_books_id ?? '',
    }))
    const csv = toCSV(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pageturn-library-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExportLoading(false)
  }

  const missingCoverCount = userBooks.filter((ub) => !ub.book?.cover_url).length

  async function runBackfill() {
    if (!user) return
    setBackfillStatus('running')
    setBackfillProgress({ done: 0, total: 0 })
    setBackfillResult(null)

    try {
      const result = await backfillMissingCovers(user.id, (done, total) => setBackfillProgress({ done, total }))
      setBackfillResult(result)
      setBackfillStatus('done')
      qc.invalidateQueries({ queryKey: ['user_books'] })
      qc.invalidateQueries({ queryKey: ['shelf_books'] })
    } catch {
      setBackfillStatus('error')
    }
  }

  async function runDedupe() {
    if (!user) return
    setDedupeStatus('running')
    setDedupeResult(null)
    try {
      const result = await dedupeLibraryBooks(user.id)
      setDedupeResult(result)
      setDedupeStatus('done')
      qc.invalidateQueries({ queryKey: ['user_books'] })
      qc.invalidateQueries({ queryKey: ['shelf_books'] })
      qc.invalidateQueries({ queryKey: ['challenges'] })
    } catch {
      setDedupeStatus('error')
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setImportStatus('loading')
    setImportMessage('Reading and importing your library…')
    setImportSummary(null)

    try {
      const text = await file.text()
      const summary = await importGoodreadsCsv(user.id, text)
      setImportSummary(summary)
      setImportMessage(
        `Imported ${summary.imported} of ${summary.totalRows} books` +
        (summary.shelvesCreated ? `, created ${summary.shelvesCreated} new shelf${summary.shelvesCreated === 1 ? '' : 'es'}` : '') +
        '.'
      )
      setImportStatus(summary.errors.length && summary.imported === 0 ? 'error' : 'success')
      qc.invalidateQueries({ queryKey: ['user_books'] })
      qc.invalidateQueries({ queryKey: ['shelves'] })
      qc.invalidateQueries({ queryKey: ['shelf_books'] })
      qc.invalidateQueries({ queryKey: ['challenges'] })

      if (summary.imported > 0) runBackfill()
    } catch (err) {
      setImportStatus('error')
      setImportMessage(err instanceof Error ? err.message : 'Failed to import file.')
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-serif text-gray-900 mb-1">Import & Export</h1>
        <p className="text-gray-500 text-sm">Move your reading data in and out of PageTurn.</p>
      </div>

      {/* Export */}
      <div className="bg-white rounded-xl border border-parchment-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-green-50 rounded-xl text-green-600 flex-shrink-0">
            <Download size={22} />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 mb-1">Export Library</h2>
            <p className="text-sm text-gray-500 mb-4">
              Download your entire library as a CSV file — a full backup including titles, authors, ratings,
              favorites, reading status, reviews, dates, and any covers/genres/descriptions found by
              "Fix Missing Covers." This file can be re-uploaded through Import below to restore everything
              exactly, without needing to look anything up again.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={handleExport} loading={exportLoading} variant="secondary">
                <Download size={15} /> Download CSV ({userBooks.length} books)
              </Button>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <FileText size={13} />
                <span>pageturn-library-{new Date().toISOString().split('T')[0]}.csv</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import */}
      <div className="bg-white rounded-xl border border-parchment-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600 flex-shrink-0">
            <Upload size={22} />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 mb-1">Import a Library</h2>
            <p className="text-sm text-gray-500 mb-2">
              Accepts a Goodreads export (My Books → Export) or a CSV previously downloaded from
              "Export Library" above — detected automatically.
            </p>
            <ol className="text-xs text-gray-500 list-decimal list-inside mb-4 space-y-1">
              <li>Goodreads: go to <strong>goodreads.com</strong> → My Books → scroll down → <strong>Export Library</strong></li>
              <li>PageTurn: use a CSV from "Export Library" above — restores covers/genres without any lookups</li>
              <li>Upload the CSV below</li>
            </ol>
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">
              Re-importing an older PageTurn export will overwrite current cover/genre/description data for
              matching books with whatever was in that file — best for restoring into a fresh library, not
              merging into one you've since improved.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              className="hidden"
            />
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={importStatus === 'loading'}
            >
              <Upload size={15} />
              {importStatus === 'loading' ? 'Processing…' : 'Upload Goodreads CSV'}
            </Button>

            {importStatus !== 'idle' && (
              <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2
                ${importStatus === 'success' ? 'bg-green-50 text-green-700' : ''}
                ${importStatus === 'error' ? 'bg-red-50 text-red-700' : ''}
                ${importStatus === 'loading' ? 'bg-blue-50 text-blue-700' : ''}`}
              >
                {importStatus === 'error' && <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />}
                {importStatus === 'success' && <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />}
                {importMessage}
              </div>
            )}

            {importSummary && importSummary.errors.length > 0 && (
              <div className="mt-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-xs space-y-1 max-h-40 overflow-y-auto">
                <p className="font-medium">{importSummary.errors.length} issue{importSummary.errors.length === 1 ? '' : 's'}:</p>
                {importSummary.errors.slice(0, 20).map((err, i) => <p key={i}>• {err}</p>)}
                {importSummary.errors.length > 20 && <p>…and {importSummary.errors.length - 20} more.</p>}
              </div>
            )}

            {importSummary && importStatus === 'success' && (
              <p className="mt-2 text-xs text-gray-400">
                Now looking up covers and genres for the imported books below — this runs automatically after
                every import.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Backfill covers */}
      <div className="bg-white rounded-xl border border-parchment-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600 flex-shrink-0">
            <ImageOff size={22} />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 mb-1">Fix Missing Covers</h2>
            <p className="text-sm text-gray-500 mb-4">
              Looks up each book in your library that's missing a cover (mainly ones imported from Goodreads,
              which doesn't export cover images) via Google Books or Open Library, and fills in the cover —
              plus genre, description, and page count if those are blank too. Also checks for two books
              incorrectly sharing the same cover and clears them for re-matching. Runs automatically right
              after every Goodreads import; use this button to re-run it any time. For a large library this
              can take several minutes — stay on this page until it finishes.
            </p>

            <Button
              variant="secondary"
              onClick={runBackfill}
              loading={backfillStatus === 'running'}
              disabled={missingCoverCount === 0 || backfillStatus === 'running'}
            >
              <ImageOff size={15} />
              {missingCoverCount === 0 ? 'All books have covers' : `Fix ${missingCoverCount} Missing Cover${missingCoverCount === 1 ? '' : 's'}`}
            </Button>

            {backfillStatus === 'running' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{backfillProgress.total ? `Looking up ${backfillProgress.done} of ${backfillProgress.total}…` : 'Loading your library…'}</span>
                  <span>{backfillProgress.total ? Math.round((backfillProgress.done / backfillProgress.total) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-parchment-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${backfillProgress.total ? (backfillProgress.done / backfillProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {backfillStatus === 'done' && backfillResult && (
              <div className="mt-4 space-y-2">
                <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-start gap-2">
                  <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                  <span>
                    {backfillResult.duplicatesCleared > 0 &&
                      `Cleared ${backfillResult.duplicatesCleared} wrongly-shared cover${backfillResult.duplicatesCleared === 1 ? '' : 's'} for re-matching. `}
                    Found covers for {backfillResult.updated} of {backfillResult.total} books.
                    {backfillResult.noMatch > 0 && ` ${backfillResult.noMatch} had no confident match.`}
                    {backfillResult.failed > 0 && ` ${backfillResult.failed} hit an error.`}
                  </span>
                </div>
                {backfillResult.sampleErrors.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs space-y-1">
                    <p className="font-medium">Sample errors (for troubleshooting):</p>
                    {backfillResult.sampleErrors.map((err, i) => <p key={i}>• {err}</p>)}
                  </div>
                )}
                {backfillResult.noMatchSamples.length > 0 && (
                  <div className="p-3 rounded-lg bg-gray-50 text-gray-600 text-xs space-y-1.5 max-h-48 overflow-y-auto">
                    <p className="font-medium">Sample no-match books (for troubleshooting):</p>
                    {backfillResult.noMatchSamples.map((s, i) => (
                      <div key={i} className="border-b border-gray-200 pb-1 last:border-0">
                        <p>"{s.title}" → searched as "{s.searchedAs}"</p>
                        <p className="text-gray-400">
                          {s.resultCount === 0 ? 'zero search results' : `${s.resultCount} results, closest was "${s.topResultTitle}" (not confident enough or already used)`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {backfillStatus === 'error' && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-start gap-2">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                Something went wrong. Try again in a moment.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Remove duplicates */}
      <div className="bg-white rounded-xl border border-parchment-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600 flex-shrink-0">
            <Copy size={22} />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 mb-1">Remove Duplicate Books</h2>
            <p className="text-sm text-gray-500 mb-4">
              Goodreads catalogs different editions of the same book (hardcover, paperback, a reissue) as
              separate entries, each with its own ISBN — importing your library can carry that split over as
              two copies of what you consider one book. This finds books with a matching title and author,
              merges them into one (keeping the best rating, review, status, and shelf memberships from
              either copy), and removes the extra.
            </p>

            <Button variant="secondary" onClick={runDedupe} loading={dedupeStatus === 'running'}>
              <Copy size={15} /> Scan for Duplicates
            </Button>

            {dedupeStatus === 'done' && dedupeResult && (
              <div className="mt-4 space-y-2">
                <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-start gap-2">
                  <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                  {dedupeResult.groupsMerged === 0
                    ? 'No duplicates found.'
                    : `Merged ${dedupeResult.entriesRemoved} duplicate ${dedupeResult.entriesRemoved === 1 ? 'entry' : 'entries'} across ${dedupeResult.groupsMerged} book${dedupeResult.groupsMerged === 1 ? '' : 's'}.`}
                </div>
                {dedupeResult.mergedTitles.length > 0 && (
                  <div className="p-3 rounded-lg bg-gray-50 text-gray-600 text-xs space-y-1 max-h-40 overflow-y-auto">
                    {dedupeResult.mergedTitles.map((t, i) => <p key={i}>• {t}</p>)}
                  </div>
                )}
              </div>
            )}

            {dedupeStatus === 'error' && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-start gap-2">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                Something went wrong. Try again in a moment.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* What gets imported */}
      <div className="bg-parchment-50 rounded-xl border border-parchment-200 p-5">
        <p className="text-sm font-medium text-gray-700 mb-2">What's imported</p>
        <p className="text-sm text-gray-500">
          Title, authors, ISBN, page count, your rating, review, read/currently-reading/want-to-read status,
          date finished, and any custom Goodreads shelves (recreated here as PageTurn shelves). Covers and
          genre tags aren't included in Goodreads' export format, so those stay blank until you look the book
          up again via Search.
        </p>
      </div>
    </div>
  )
}
