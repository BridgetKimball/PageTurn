import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trophy, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { syncExpiredChallenges } from '../lib/challenges'
import type { Challenge } from '../types'
import { ChallengeCard } from '../components/challenges/ChallengeCard'
import { CreateChallengeModal } from '../components/challenges/CreateChallengeModal'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'

type Filter = 'all' | 'active' | 'completed' | 'failed'

export function Challenges() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('active')
  const [showCreate, setShowCreate] = useState(false)
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null)

  const { data: challenges = [], isLoading } = useQuery<Challenge[]>({
    queryKey: ['challenges', user?.id, 'all'],
    enabled: !!user,
    queryFn: async () => {
      await syncExpiredChallenges(user!.id)

      const { data } = await supabase
        .from('challenges')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (!data) return []

      const ids = data.map((c) => c.id)
      if (!ids.length) return data.map((c) => ({ ...c, books_completed: 0 }))
      const { data: counts } = await supabase
        .from('challenge_books')
        .select('challenge_id')
        .in('challenge_id', ids)
        .eq('user_id', user!.id)
      return data.map((c) => ({
        ...c,
        books_completed: counts?.filter((cb) => cb.challenge_id === c.id).length ?? 0,
      }))
    },
  })

  const deleteChallenge = useMutation({
    mutationFn: async (challengeId: string) => {
      await supabase.from('challenges').delete().eq('id', challengeId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] })
    },
  })

  const handleDelete = (challenge: Challenge) => {
    if (confirm(`Delete "${challenge.title}"? This can't be undone.`)) {
      deleteChallenge.mutate(challenge.id)
    }
  }

  const filtered = challenges.filter((c) => filter === 'all' || c.status === filter)

  const tabs: { value: Filter; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-gray-900 mb-1 flex items-center gap-2">
            <Trophy size={22} className="text-amber-500" />
            Reading Challenges
          </h1>
          <p className="text-gray-500 text-sm">Set goals and track your reading achievements.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Challenge
        </Button>
      </div>

      <div className="flex rounded-lg border border-parchment-200 bg-white overflow-hidden w-fit">
        {tabs.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${filter === value ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-parchment-50'}`}
          >
            {label}
            {value !== 'all' && (
              <span className={`ml-1.5 text-xs ${filter === value ? 'opacity-70' : 'text-gray-400'}`}>
                ({challenges.filter((c) => c.status === value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy size={48} />}
          title={filter === 'active' ? 'No active challenges' : 'No challenges here'}
          description={
            filter === 'active'
              ? 'Create a challenge to push your reading further — daily, monthly, or yearly.'
              : 'Complete some reading challenges to see them here.'
          }
          action={
            filter === 'active' ? (
              <Button onClick={() => setShowCreate(true)}>
                <Plus size={16} /> Create Challenge
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onEdit={setEditingChallenge}
              onDelete={handleDelete}
              deleting={deleteChallenge.isPending && deleteChallenge.variables === c.id}
            />
          ))}
        </div>
      )}

      <CreateChallengeModal
        open={showCreate || !!editingChallenge}
        challenge={editingChallenge}
        onClose={() => { setShowCreate(false); setEditingChallenge(null) }}
      />
    </div>
  )
}
