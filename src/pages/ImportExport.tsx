import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Upload, FileText, AlertCircle, CheckCircle2, ImageOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { importGoodreadsCsv, type ImportSummary } from '../lib/goodreadsImport'
import { backfillMissingCovers, type BackfillResult } from '../lib/backfillCovers'
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
      current_page: ub.current_page ?? '',
      page_count: ub.book?.page_count ?? '',
      date_started: ub.date_started ?? '',
      date_finished: ub.date_finished ?? '',
      genres: ub.book?.genres.join('; ') ?? '',
      review: ub.review ?? '',
      isbn: ub.book?.isbn ?? '',
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
    } catch (err) {
      setImportStatus('error')
      setImportMessage(err instanceof Error ? err.message : 'Failed to import file.')
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  const missingCoverCount = userBooks.filter((ub) => !ub.book?.cover_url).length

  async function handleBackfillCovers() {
    if (!user) return
    setBackfillStatus('running')
    setBackfillProgress({ done: 0, total: missingCoverCount })
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
              Download your entire library as a CSV file. Includes titles, authors, ratings,
              reading status, reviews, and dates.
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
            <h2 className="font-semibold text-gray-900 mb-1">Import from Goodreads</h2>
            <p className="text-sm text-gray-500 mb-2">
              Export your Goodreads library (My Books → Export), then upload the CSV here.
            </p>
            <ol className="text-xs text-gray-500 list-decimal list-inside mb-4 space-y-1">
              <li>Go to <strong>goodreads.com</strong> → My Books</li>
              <li>Scroll to the bottom → click <strong>Export Library</strong></li>
              <li>Upload the downloaded CSV below</li>
            </ol>

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

            {importSummary && (
              <p className="mt-2 text-xs text-gray-400">
                Note: Goodreads exports don't include genre/category data, so imported books won't automatically
                match genre-filtered reading challenges — you can still add them to shelves manually.
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
              plus genre, description, and page count if those are blank too.
            </p>

            <Button
              variant="secondary"
              onClick={handleBackfillCovers}
              loading={backfillStatus === 'running'}
              disabled={missingCoverCount === 0}
            >
              <ImageOff size={15} />
              {missingCoverCount === 0 ? 'All books have covers' : `Fix ${missingCoverCount} Missing Cover${missingCoverCount === 1 ? '' : 's'}`}
            </Button>

            {backfillStatus === 'running' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Looking up {backfillProgress.done} of {backfillProgress.total}…</span>
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
              <div className="mt-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-start gap-2">
                <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                Found covers for {backfillResult.updated} of {backfillResult.total} books.
                {backfillResult.total - backfillResult.updated > 0 && (
                  <> {backfillResult.total - backfillResult.updated} had no confident match — try again later or
                  add a Google Books API key for better coverage.</>
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
