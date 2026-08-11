import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { Layout } from './components/layout/Layout'
import { LoginForm } from './components/auth/LoginForm'
import { RegisterForm } from './components/auth/RegisterForm'
import { Dashboard } from './pages/Dashboard'
import { Search } from './pages/Search'
import { Library } from './pages/Library'
import { ShelfView } from './pages/ShelfView'
import { BookDetail } from './pages/BookDetail'
import { Challenges } from './pages/Challenges'
import { ImportExport } from './pages/ImportExport'
import { Profile } from './pages/Profile'
import { CreateShelfPage } from './pages/CreateShelfPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen bg-parchment-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-primary-200 border-t-primary-600 rounded-full" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginForm /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterForm /></PublicOnly>} />

      <Route
        path="/*"
        element={
          <AuthGuard>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/shelves/new" element={<CreateShelfPage />} />
                <Route path="/shelves/:id" element={<ShelfView />} />
                <Route path="/books/:googleBooksId" element={<BookDetail />} />
                <Route path="/challenges" element={<Challenges />} />
                <Route path="/import" element={<ImportExport />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </AuthGuard>
        }
      />
    </Routes>
  )
}
