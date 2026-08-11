import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface CreateShelfModalProps {
  open: boolean
  onClose: () => void
}

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
]

export function CreateShelfModal({ open, onClose }: CreateShelfModalProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])

  const create = useMutation({
    mutationFn: async () => {
      await supabase.from('shelves').insert({
        user_id: user!.id,
        name,
        description: description || null,
        color,
        is_default: false,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shelves'] })
      onClose()
      setName(''); setDescription(''); setColor(PRESET_COLORS[0])
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Create New Shelf" size="sm">
      <div className="space-y-4">
        <Input
          label="Shelf Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Religious, Favorites, Book Club"
          required
        />
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What kind of books go here?"
        />
        <div>
          <p className="text-sm font-medium text-parchment-800 mb-2">Color</p>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!name.trim()}
            className="flex-1"
          >
            Create Shelf
          </Button>
        </div>
      </div>
    </Modal>
  )
}
