import { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  titleClassName?: string
}

export function Modal({ isOpen, onClose, title, children, className, titleClassName }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className={cn(
          "relative z-50 w-full max-w-lg rounded-2xl shadow-xl",
          "bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-xl",
          "border border-white/20",
          title ? "p-6" : "p-5",
          className
        )}
      >
        {/* Header - Only show if there's a title */}
        {title && (
          <div className="mb-4">
            <h2 className={cn(
              "text-3xl font-bold text-white text-center uppercase tracking-wider",
              titleClassName
            )}>
              {title}
            </h2>
          </div>
        )}

        {children}
      </div>
    </div>
  )
} 