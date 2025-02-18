import { useAnimatedCounter } from '@/lib/hooks/useAnimatedCounter'
import { cn } from '@/lib/utils/cn'

interface AnimatedScoreProps {
  value: number
  className?: string
}

export function AnimatedScore({ value, className }: AnimatedScoreProps) {
  const animatedValue = useAnimatedCounter(value)

  return (
    <div className={cn(
      "text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent",
      "drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]",
      "transition-transform duration-150",
      value > 0 && "animate-[scoreUpdate_0.5s_ease-out]",
      className
    )}>
      {animatedValue}
    </div>
  )
} 