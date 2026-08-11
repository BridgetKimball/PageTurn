import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Upload, FileText, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [exportLoading, setExportLoading] = useState(false)

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
    if (!file) return
    setImportStatus('loading')
    setImportMessage('Parsing file…')

    try {
      const text = await file.text()
      const lines = text.split('\n').filter((l) => l.trim())
      if (lines.length < 2) throw new Error('File appears empty.')

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase())
      const titleIdx = headers.indexOf('title')
      const authorIdx = headers.findIndex((h) => h.includes('author'))
      const shelvesIdx = headers.findIndex((h) => h.includes('shelf') || h.includes('status') || h.includes('bookshelves'))

      if (titleIdx === -1) throw new Error('Could not find a "title" column.')

      const parsed = lines.slice(1).map((line) => {
        const cols = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')) ?? []
        return {
          title: cols[titleIdx]?.trim() ?? '',
          author: authorIdx >= 0 ? cols[authorIdx]?.trim() ?? '' : '',
          shelf: shelvesIdx >= 0 ? cols[shelvesIdx]?.trim() ?? '' : '',
        }
      }).filter((r) => r.title)

      setImportMessage(`Found ${parsed.length} books. Goodreads import is being prepared — full import coming in a future update.`)
      setImportStatus('success')
    } catch (err) {
      setImportStatus('error')
      setImportMessage(err instanceof Error ? err.message : 'Failed to parse file.')
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
                {importMessage}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Future */}
      <div className="bg-parchment-50 rounded-xl border border-parchment-200 p-5 text-center">
        <p className="text-sm text-gray-500">
          Full Goodreads import (preserving shelves, ratings, and reviews) is planned for a future update.
        </p>
      </div>
    </div>
  )
}
