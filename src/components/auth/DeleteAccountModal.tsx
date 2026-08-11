import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface DeleteAccountModalProps {
  open: boolean
  onClose: () => void
}

export function DeleteAccountModal({ open, onClose }: DeleteAccountModalProps) {
  const { user, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const expectedText = user?.email ?? ''
  const canDelete = confirmText.trim().toLowerCase() === expectedText.toLowerCase() && !!expectedText

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    setError('')
    const result = await deleteAccount()
    setDeleting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate('/login', {
      state: result.fullyDeleted
        ? undefined
        : { notice: 'Your reading data was deleted. Contact support if you also want your login removed.' },
    })
  }

  function handleClose() {
    setConfirmText('')
    setError('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Delete Account" size="sm">
      <div className="space-y-4">
        <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            <p className="font-medium">This can't be undone.</p>
            <p className="mt-1">
              Every book, shelf, reading session, and challenge in your PageTurn library will be permanently deleted.
            </p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            Type <span className="font-mono font-semibold">{expectedText}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expectedText}
            autoComplete="off"
            className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={handleClose} className="flex-1">Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            loading={deleting}
            disabled={!canDelete}
            className="flex-1"
          >
            Delete My Account
          </Button>
        </div>
      </div>
    </Modal>
  )
}
