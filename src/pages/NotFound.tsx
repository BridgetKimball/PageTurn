import { Link } from 'react-router-dom'
import { BookX } from 'lucide-react'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <BookX size={48} className="text-parchment-300 mb-4" />
      <h1 className="text-2xl font-bold font-serif text-gray-900 mb-2">Nothing here</h1>
      <p className="text-gray-500 text-sm max-w-sm mb-6">
        This page doesn't exist — it may have been moved, or the link was wrong.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
