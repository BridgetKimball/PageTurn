import { useState } from 'react'
import { User, Mail, Edit3, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { DeleteAccountModal } from '../components/auth/DeleteAccountModal'

export function Profile() {
  const { profile, updateProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  async function handleSave() {
    setSaving(true)
    await updateProfile({ display_name: displayName, bio })
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold font-serif text-gray-900">Profile</h1>

      <div className="bg-white rounded-xl border border-parchment-200 p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <User size={28} className="text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{profile?.display_name ?? '—'}</h2>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
              <Mail size={13} />
              {profile?.email}
            </div>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <div>
              <label className="text-sm font-medium text-parchment-800 block mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Tell us a bit about yourself and your reading tastes…"
                className="w-full rounded-lg border border-parchment-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} loading={saving}>Save Changes</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            {profile?.bio && <p className="text-sm text-gray-600">{profile.bio}</p>}
            {!profile?.bio && <p className="text-sm text-gray-400 italic">No bio yet.</p>}
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => {
              setDisplayName(profile?.display_name ?? '')
              setBio(profile?.bio ?? '')
              setEditing(true)
            }}>
              <Edit3 size={13} /> Edit Profile
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-parchment-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-1">Member since</h3>
        <p className="text-sm text-gray-500">
          {profile?.created_at
            ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : '—'}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h3 className="font-semibold text-red-700 mb-1 flex items-center gap-2">
          <AlertTriangle size={16} /> Danger Zone
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Permanently delete your account and everything in it — books, shelves, reading sessions, and challenges.
          This can't be undone.
        </p>
        <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
          Delete Account
        </Button>
      </div>

      <DeleteAccountModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </div>
  )
}
