import { Trophy, Calendar, BookOpen, Trash2, Edit3 } from 'lucide-react'
import type { Challenge } from '../../types'
import { Badge } from '../ui/Badge'

function daysLeft(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_VARIANT = {
  active: 'success' as const,
  completed: 'primary' as const,
  failed: 'danger' as const,
}

interface ChallengeCardProps {
  challenge: Challenge
  onEdit?: (challenge: Challenge) => void
  onDelete?: (challenge: Challenge) => void
  deleting?: boolean
}

export function ChallengeCard({ challenge, onEdit, onDelete, deleting }: ChallengeCardProps) {
  const completed = challenge.books_completed ?? 0
  const pct = Math.min(100, (completed / challenge.target_count) * 100)
  const remaining = daysLeft(challenge.end_date)

  return (
    <div className="bg-white rounded-xl border border-parchment-200 hover:border-primary-300 hover:shadow-md transition-all p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Trophy size={18} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">{challenge.title}</h3>
            {challenge.genre_filter && (
              <p className="text-xs text-gray-500 mt-0.5">Genre: {challenge.genre_filter}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant={STATUS_VARIANT[challenge.status]}>
            {challenge.status.charAt(0).toUpperCase() + challenge.status.slice(1)}
          </Badge>
          {onEdit && (
            <button
              onClick={() => onEdit(challenge)}
              title="Edit challenge"
              className="p-1 rounded text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            >
              <Edit3 size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(challenge)}
              disabled={deleting}
              title="Delete challenge"
              className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="font-medium text-gray-700">
            {completed} / {challenge.target_count} books
          </span>
          <span className="text-gray-400">{Math.round(pct)}%</span>
        </div>
        <div className="h-2 bg-parchment-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {formatDate(challenge.start_date)} – {formatDate(challenge.end_date)}
        </span>
        {challenge.status === 'active' && (
          <span className="flex items-center gap-1">
            <BookOpen size={12} />
            {remaining}d left
          </span>
        )}
      </div>
    </div>
  )
}
