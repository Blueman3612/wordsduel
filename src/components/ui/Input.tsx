import { cn } from '@/lib/utils/cn'
import { forwardRef, InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex-1 px-6 py-4 rounded-xl border border-white/20 bg-white/5 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all",
          "hover:border-white/40",
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

export { Input } 