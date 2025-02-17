'use client'

import { AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'

interface AnimatedLayoutProps {
  children: React.ReactNode
}

export function AnimatedLayout({ children }: AnimatedLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <main key={pathname} className="relative">
          {children}
        </main>
      </AnimatePresence>
    </div>
  )
} 