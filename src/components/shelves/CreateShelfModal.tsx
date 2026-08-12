import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Shelf } from '../../types'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface CreateShelfModalProps {
  open: boolean
  onClose: () => void
  shelf?: Shelf | null
}

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
]

export function CreateShelfModal({ open, onClose, shelf }: CreateShelfModalProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isEditing = !!shelf
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [folder, setFolder] = useState('')

  // Reuses the Sidebar's cached shelf list (same query key) just to derive
  // existing folder names for the datalist — no extra network round trip.
  const { data: allShelves = [] } = useQuery<Shelf[]>({
    queryKey: ['shelves', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('shelves').select('*').eq('user_id', user!.id)
      return data ?? []
    },
  })
  const existingFolders = Array.from(new Set(allShelves.map((s) => s.folder).filter((f): f is string => !!f))).sort()

  useEffect(() => {
    if (!open) return
    if (shelf) {
      setName(shelf.name)
      setDescription(shelf.description ?? '')
      setColor(shelf.color)
      setFolder(shelf.folder ?? '')
    } else {
      setName(''); setDescription(''); setColor(PRESET_COLORS[0]); setFolder('')
    }
  }, [open, shelf])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description: description || null,
        color,
        folder: folder.trim() || null,
      }
      if (isEditing) {
        await supabase.from('shelves').update(payload).eq('id', shelf!.id)
      } else {
        await supabase.from('shelves').insert({ ...payload, user_id: user!.id, is_default: false })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shelves'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Shelf' : 'Create New Shelf'} size="sm">
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
          <label className="text-sm font-medium text-parchment-800 block mb-1">Folder (optional)</label>
          <input
            list="shelf-folder-suggestions"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="e.g. Fiction, Wishlists — leave blank for no folder"
            className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
          <datalist id="shelf-folder-suggestions">
            {existingFolders.map((f) => <option key={f} value={f} />)}
          </datalist>
          <p className="text-xs text-gray-400 mt-1">Groups this shelf under a collapsible folder in the sidebar.</p>
        </div>
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
        {save.isError && (
          <p className="text-xs text-red-600">
            Couldn't save — did you run the shelves folder migration? See docs/MIGRATIONS.md.
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!name.trim()}
            className="flex-1"
          >
            {isEditing ? 'Save Changes' : 'Create Shelf'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
