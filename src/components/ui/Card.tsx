import { cn } from '@/lib/utils/cn'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  active?: boolean
  pinned?: boolean
  onClick?: () => void
}

export function Card({ children, className, active, pinned, onClick }: CardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-white/20 transition-all duration-300 z-10",
        active && "ring-2 ring-purple-400 scale-105 bg-white/20",
        pinned && "ring-2 ring-pink-400 bg-white/20",
        onClick && "cursor-pointer hover:scale-[1.02]",
        !active && !pinned && "hover:bg-white/15",
        className
      )}
    >
      {children}
    </div>
  )
} 