import { cn } from '@/lib/utils/cn'
import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
}

export function Button({ children, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold shadow-lg",
        "transition-all duration-200",
        "hover:from-purple-600 hover:to-pink-600 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl",
        "active:scale-95 active:translate-y-1 active:shadow-md",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-lg",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
} 