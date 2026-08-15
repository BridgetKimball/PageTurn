import { type ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'

export function Layout({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-parchment-50">
      <Navbar onMenuClick={() => setMobileNavOpen(true)} />
      <div className="flex">
        <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="flex-1 min-w-0 md:ml-64 mt-[var(--header-h)] p-4 md:p-8 min-h-[calc(100vh-var(--header-h))]">
          {children}
        </main>
      </div>
    </div>
  )
}
