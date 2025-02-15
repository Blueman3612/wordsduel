import { cn } from '@/lib/utils/cn'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  active?: boolean
}

export function Card({ children, className, active }: CardProps) {
  return (
    <div 
      className={cn(
        "relative bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-white/20 transition-all duration-300 z-10",
        active && "ring-2 ring-purple-400 scale-105 bg-white/20",
        !active && "hover:bg-white/15",
        className
      )}
    >
      {children}
    </div>
  )
} 