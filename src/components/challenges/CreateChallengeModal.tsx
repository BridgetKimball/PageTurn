import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { resyncChallengeBooks } from '../../lib/challenges'
import type { Challenge, ChallengeLength } from '../../types'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface CreateChallengeModalProps {
  open: boolean
  onClose: () => void
  challenge?: Challenge | null
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
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

export function CreateChallengeModal({ open, onClose, challenge }: CreateChallengeModalProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isEditing = !!challenge
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lengthType, setLengthType] = useState<ChallengeLength>('month')
  const [startDate, setStartDate] = useState(todayStr())
  const [customEnd, setCustomEnd] = useState('')
  const [targetCount, setTargetCount] = useState('12')
  const [genreFilter, setGenreFilter] = useState('')
  const [customGenre, setCustomGenre] = useState('')

  // Populate from the challenge being edited, or reset to defaults for a
  // fresh create, any time the modal opens.
  useEffect(() => {
    if (!open) return
    if (challenge) {
      setTitle(challenge.title)
      setDescription(challenge.description ?? '')
      setLengthType(challenge.length_type)
      setStartDate(challenge.start_date)
      setCustomEnd(challenge.end_date)
      setTargetCount(String(challenge.target_count))
      if (!challenge.genre_filter) {
        setGenreFilter(''); setCustomGenre('')
      } else if (COMMON_GENRES.includes(challenge.genre_filter)) {
        setGenreFilter(challenge.genre_filter)
      } else {
        setGenreFilter('custom'); setCustomGenre(challenge.genre_filter)
      }
    } else {
      setTitle(''); setDescription(''); setLengthType('month')
      setStartDate(todayStr()); setCustomEnd('')
      setTargetCount('12'); setGenreFilter(''); setCustomGenre('')
    }
  }, [open, challenge])

  function computeEndDate(start: string) {
    if (lengthType === 'custom') return customEnd
    const selected = LENGTHS.find((l) => l.value === lengthType)!
    const end = new Date(start)
    end.setDate(end.getDate() + selected.days)
    return end.toISOString().split('T')[0]
  }

  const save = useMutation({
    mutationFn: async () => {
      const end = computeEndDate(startDate)
      const genre = genreFilter === 'custom' ? customGenre : genreFilter || null
      const payload = {
        title: title || `Read ${targetCount} books`,
        description: description || null,
        length_type: lengthType,
        start_date: startDate,
        end_date: end,
        target_count: parseInt(targetCount),
        genre_filter: genre,
      }

      let challengeId: string
      if (isEditing) {
        challengeId = challenge!.id
        await supabase.from('challenges').update(payload).eq('id', challengeId)
      } else {
        const { data, error } = await supabase
          .from('challenges')
          .insert({ ...payload, user_id: user!.id, status: 'active' })
          .select('id')
          .single()
        if (error || !data) throw error ?? new Error('Failed to create challenge')
        challengeId = data.id
      }

      // A start date in the past (edited or set at creation) should pick up
      // books already finished in that window, not just ones finished from
      // here on out.
      await resyncChallengeBooks(user!.id, challengeId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Challenge' : 'Create Reading Challenge'} size="md">
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
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              hint="Can be in the past — already-finished books in range will count"
            />
            {lengthType === 'custom' && (
              <Input
                label="End Date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                min={startDate}
              />
            )}
          </div>
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

        {save.isError && (
          <p className="text-xs text-red-600">Something went wrong saving this challenge. Try again in a moment.</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!targetCount || !startDate || (lengthType === 'custom' && !customEnd)}
            className="flex-1"
          >
            {isEditing ? 'Save Changes' : 'Create Challenge'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
