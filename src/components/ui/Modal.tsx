import { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          </div>
        )}

        {/* Close button without header */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        )}

        {/* Content */}
        <div className={cn(
          "text-white/90",
          !title && "pt-2" // Add a bit of top padding when there's no header
        )}>
          {children}
        </div>
      </div>
    </div>
  )
} 