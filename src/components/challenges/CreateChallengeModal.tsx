import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { ChallengeLength } from '../../types'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface CreateChallengeModalProps {
  open: boolean
  onClose: () => void
}

const LENGTHS: { value: ChallengeLength; label: string; days: number }[] = [
  { value: 'week', label: '1 Week', days: 7 },
  { value: 'month', label: '1 Month', days: 30 },
  { value: 'year', label: '1 Year', days: 365 },
  { value: 'custom', label: 'Custom', days: 0 },
]

const COMMON_GENRES = [
  'Fiction', 'Non-Fiction', 'Mystery', 'Romance', 'Science Fiction',
  'Fantasy', 'Biography', 'History', 'Self-Help', 'Thriller',
  'Horror', "Children's", 'Young Adult', 'Poetry', 'Religion',
]

export function CreateChallengeModal({ open, onClose }: CreateChallengeModalProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lengthType, setLengthType] = useState<ChallengeLength>('month')
  const [customEnd, setCustomEnd] = useState('')
  const [targetCount, setTargetCount] = useState('12')
  const [genreFilter, setGenreFilter] = useState('')
  const [customGenre, setCustomGenre] = useState('')

  function computeDates() {
    const start = new Date().toISOString().split('T')[0]
    if (lengthType === 'custom') return { start, end: customEnd }
    const selected = LENGTHS.find((l) => l.value === lengthType)!
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + selected.days)
    return { start, end: endDate.toISOString().split('T')[0] }
  }

  const create = useMutation({
    mutationFn: async () => {
      const { start, end } = computeDates()
      const genre = genreFilter === 'custom' ? customGenre : genreFilter || null
      await supabase.from('challenges').insert({
        user_id: user!.id,
        title: title || `Read ${targetCount} books`,
        description: description || null,
        length_type: lengthType,
        start_date: start,
        end_date: end,
        target_count: parseInt(targetCount),
        genre_filter: genre,
        status: 'active',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] })
      onClose()
      setTitle(''); setDescription(''); setLengthType('month')
      setTargetCount('12'); setGenreFilter(''); setCustomGenre('')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Create Reading Challenge" size="md">
      <div className="space-y-4">
        <Input
          label="Challenge Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 12 Books in 2025"
          hint="Leave blank to auto-generate from your settings"
        />

        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's motivating this challenge?"
        />

        <div>
          <p className="text-sm font-medium text-parchment-800 mb-2">Duration</p>
          <div className="grid grid-cols-4 gap-2">
            {LENGTHS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setLengthType(value)}
                className={`py-2 text-xs font-medium rounded-lg border transition-colors
                  ${lengthType === value
                    ? 'bg-primary-50 border-primary-500 text-primary-700'
                    : 'border-parchment-200 text-gray-600 hover:bg-parchment-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {lengthType === 'custom' && (
            <div className="mt-2">
              <Input
                label="End Date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}
        </div>

        <Input
          label="Number of Books"
          type="number"
          min={1}
          max={1000}
          value={targetCount}
          onChange={(e) => setTargetCount(e.target.value)}
        />

        <div>
          <p className="text-sm font-medium text-parchment-800 mb-2">Genre Filter (optional)</p>
          <p className="text-xs text-gray-500 mb-2">Only books in this genre count toward the challenge.</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <button
              onClick={() => setGenreFilter('')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                ${!genreFilter ? 'bg-primary-50 border-primary-500 text-primary-700' : 'border-parchment-200 text-gray-600'}`}
            >
              Any Genre
            </button>
            {COMMON_GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setGenreFilter(g === genreFilter ? '' : g)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                  ${genreFilter === g ? 'bg-primary-50 border-primary-500 text-primary-700' : 'border-parchment-200 text-gray-600 hover:bg-parchment-50'}`}
              >
                {g}
              </button>
            ))}
            <button
              onClick={() => setGenreFilter('custom')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                ${genreFilter === 'custom' ? 'bg-primary-50 border-primary-500 text-primary-700' : 'border-parchment-200 text-gray-600 hover:bg-parchment-50'}`}
            >
              Custom…
            </button>
          </div>
          {genreFilter === 'custom' && (
            <Input
              value={customGenre}
              onChange={(e) => setCustomGenre(e.target.value)}
              placeholder="e.g. Christian Fiction"
            />
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!targetCount || (lengthType === 'custom' && !customEnd)}
            className="flex-1"
          >
            Create Challenge
          </Button>
        </div>
      </div>
    </Modal>
  )
}
