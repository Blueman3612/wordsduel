import { ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [alignment, setAlignment] = useState<'center' | 'left' | 'right'>('center')
  const tooltipRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updatePosition = () => {
      const tooltip = tooltipRef.current
      const container = containerRef.current
      if (!tooltip || !container) return

      const tooltipRect = tooltip.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const viewportWidth = window.innerWidth

      // Check horizontal alignment
      const spaceLeft = containerRect.left
      const spaceRight = viewportWidth - containerRect.right
      
      if (tooltipRect.width / 2 > spaceLeft) {
        setAlignment('left')
      } else if (tooltipRect.width / 2 > spaceRight) {
        setAlignment('right')
      } else {
        setAlignment('center')
      }
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition)
    
    // Initial position check
    setTimeout(updatePosition, 0)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition)
    }
  }, [])

  return (
    <div ref={containerRef} className="group relative inline-block">
      {children}
      <div 
        ref={tooltipRef}
        className={cn(
          'absolute max-w-[min(calc(100vw-2rem),20rem)]',
          'bottom-[calc(100%+1.5rem)]',
          // Horizontal alignment
          alignment === 'center' ? 'left-1/2 -translate-x-1/2' :
          alignment === 'left' ? 'left-0' : 'right-0',
          'px-4 py-3 rounded-xl',
          'bg-black/80 backdrop-blur-xl border border-white/10',
          'text-white text-sm',
          'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
          'transition-all duration-200 ease-out',
          'shadow-xl shadow-black/20',
          'z-[200] pointer-events-none group-hover:pointer-events-auto',
          // Arrow positioning
          'after:absolute after:bottom-[-8px]',
          alignment === 'center' ? 'after:left-1/2 after:-translate-x-1/2' :
          alignment === 'left' ? 'after:left-4' : 'after:right-4',
          'after:border-8 after:border-transparent after:border-t-black/80',
          className
        )}
      >
        {content}
      </div>
    </div>
  )
} 