import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Search, Library, Trophy, Download, Plus,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Shelf } from '../../types'

const navItems = [
  { to: '/',          label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/search',   label: 'Search Books', icon: Search },
  { to: '/library',  label: 'My Library',   icon: Library },
  { to: '/challenges', label: 'Challenges', icon: Trophy },
  { to: '/import',   label: 'Import / Export', icon: Download },
]

export function Sidebar() {
  const { user } = useAuth()

  const { data: shelves = [] } = useQuery<Shelf[]>({
    queryKey: ['shelves', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('shelves')
        .select('*')
        .eq('user_id', user!.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      return data ?? []
    },
  })

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
     ${isActive
       ? 'bg-primary-50 text-primary-700'
       : 'text-gray-600 hover:bg-parchment-100 hover:text-gray-900'}`

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-parchment-200 overflow-y-auto">
      <nav className="p-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        <div className="pt-4">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Shelves</span>
            <NavLink
              to="/shelves/new"
              className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              title="Create shelf"
            >
              <Plus size={14} />
            </NavLink>
          </div>

          <div className="space-y-0.5">
            {shelves.map((shelf) => (
              <NavLink
                key={shelf.id}
                to={`/shelves/${shelf.id}`}
                className={linkClass}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: shelf.color }}
                />
                <span className="truncate">{shelf.name}</span>
                {shelf.book_count !== undefined && (
                  <span className="ml-auto text-xs text-gray-400">{shelf.book_count}</span>
                )}
              </NavLink>
            ))}
          </div>

          {shelves.length === 0 && (
            <p className="px-3 text-xs text-gray-400 italic">No shelves yet</p>
          )}
        </div>
      </nav>
    </aside>
  )
}
