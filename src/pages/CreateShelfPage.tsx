import { useNavigate } from 'react-router-dom'
import { CreateShelfModal } from '../components/shelves/CreateShelfModal'

export function CreateShelfPage() {
  const navigate = useNavigate()
  return (
    <CreateShelfModal
      open={true}
      onClose={() => navigate(-1)}
    />
  )
}
