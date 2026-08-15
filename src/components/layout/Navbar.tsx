import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Search, LogOut, User, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

interface NavbarProps {
  onMenuClick: () => void
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-[var(--header-h)] pt-[env(safe-area-inset-top)] bg-white border-b border-parchment-200 shadow-sm">
      <div className="flex items-center justify-between h-16 gap-2 px-3 sm:px-6">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onMenuClick}
            className="p-2 -ml-1 rounded-lg text-gray-500 hover:bg-parchment-100 md:hidden flex-shrink-0"
            title="Open menu"
          >
            <Menu size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2.5 group min-w-0">
            <div className="p-1.5 bg-primary-600 rounded-lg group-hover:bg-primary-700 transition-colors flex-shrink-0">
              <BookOpen size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 font-serif hidden sm:inline truncate">PageTurn</span>
          </Link>
        </div>

        <Link
          to="/search"
          className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-parchment-100 hover:bg-parchment-200 text-parchment-700 text-sm transition-colors w-64"
        >
          <Search size={15} />
          <span>Search books...</span>
        </Link>
        <Link
          to="/search"
          className="md:hidden p-2 rounded-full bg-parchment-100 hover:bg-parchment-200 text-parchment-700 transition-colors"
          title="Search books"
        >
          <Search size={18} />
        </Link>

        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            to="/profile"
            className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-parchment-100 text-sm text-gray-700 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-primary-700" />
            </div>
            <span className="font-medium hidden sm:inline">{profile?.display_name ?? 'Profile'}</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-parchment-100 transition-colors"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
