'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
  duration?: number
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // Wait for fade out animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const Icon = {
    success: CheckCircle2,
    error: XCircle,
    info: AlertCircle
  }[type]

  const colors = {
    success: 'from-green-500/20 to-green-500/10 border-green-500/50',
    error: 'from-red-500/20 to-red-500/10 border-red-500/50',
    info: 'from-purple-500/20 to-purple-500/10 border-purple-500/50'
  }[type]

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-[9999] transition-all duration-300 ease-in-out transform',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg',
          'bg-gradient-to-r border backdrop-blur-md',
          colors
        )}
      >
        <Icon className="w-5 h-5 text-white" />
        <p className="text-white/90">{message}</p>
      </div>
    </div>
  )
} 