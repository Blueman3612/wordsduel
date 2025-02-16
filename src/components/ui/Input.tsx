import { cn } from '@/lib/utils/cn'
import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface BaseProps {
  className?: string
  isTextarea?: boolean
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, BaseProps {}
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, BaseProps {}

const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps | TextareaProps>(
  ({ className, isTextarea, ...props }, ref) => {
    const baseClassName = cn(
      "flex-1 px-6 py-4 rounded-xl border border-white/20 bg-white/5 text-white",
      "placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400",
      "transition-all hover:border-white/40",
      className
    )

    if (isTextarea) {
      return (
        <textarea
          ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
          className={baseClassName}
          {...(props as TextareaProps)}
        />
      )
    }

    return (
      <input
        ref={ref as React.ForwardedRef<HTMLInputElement>}
        className={baseClassName}
        {...(props as InputProps)}
      />
    )
  }
)

Input.displayName = 'Input'

export { Input } 