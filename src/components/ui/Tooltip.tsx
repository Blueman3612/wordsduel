import { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <div className="group relative inline-block">
      {children}
      <div className={cn(
        'absolute left-1/2 -translate-x-1/2 -translate-y-full -top-2',
        'px-3 py-2 rounded-lg',
        'bg-white/10 backdrop-blur-md border border-white/10',
        'text-white text-sm font-medium',
        'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
        'transition-all duration-200 ease-out',
        'shadow-lg shadow-black/5',
        'whitespace-nowrap',
        'after:absolute after:left-1/2 after:-translate-x-1/2 after:top-full',
        'after:border-4 after:border-transparent after:border-t-white/10',
        className
      )}>
        {content}
      </div>
    </div>
  )
} 