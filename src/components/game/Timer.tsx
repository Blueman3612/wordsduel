import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface TimerProps {
  timeLeft: number // time in milliseconds
  isActive: boolean
  className?: string
}

export function Timer({ timeLeft, isActive, className }: TimerProps) {
  // Convert milliseconds to minutes and seconds
  const minutes = Math.floor(timeLeft / 60000)
  const seconds = Math.floor((timeLeft % 60000) / 1000)

  return (
    <div 
      className={cn(
        "text-lg font-medium bg-white/5 px-3 py-1 rounded-lg backdrop-blur-sm border transition-colors duration-300",
        isActive 
          ? "border-purple-500/40 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]" 
          : "border-white/10 text-white/60",
        className
      )}
    >
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </div>
  )
} 