import { useAnimatedCounter } from '@/lib/hooks/useAnimatedCounter'
import { cn } from '@/lib/utils/cn'
import { useEffect, useState, useRef } from 'react'

interface AnimatedScoreProps {
  value: number
  className?: string
}

export function AnimatedScore({ value, className }: AnimatedScoreProps) {
  const animatedValue = useAnimatedCounter(value)
  const [isAnimating, setIsAnimating] = useState(false)
  const [fontSize, setFontSize] = useState(30) // 1.875rem in pixels
  const prevValue = useRef(value)

  useEffect(() => {
    if (value !== prevValue.current) {
      setIsAnimating(true)
      
      // Animation keyframes for font size
      const keyframes = [
        { time: 0, size: 30 },    // 1.875rem
        { time: 50, size: 42 },   // 2.625rem
        { time: 100, size: 30 }   // 1.875rem
      ]

      const startTime = Date.now()
      const duration = 800 // 0.8s to match our animation duration

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Find the current and next keyframe
        const currentKeyframe = keyframes.findIndex(k => k.time / 100 > progress) - 1
        const nextKeyframe = currentKeyframe + 1

        if (currentKeyframe >= 0 && nextKeyframe < keyframes.length) {
          const k1 = keyframes[currentKeyframe]
          const k2 = keyframes[nextKeyframe]
          
          const frameProgress = (progress * 100 - k1.time) / (k2.time - k1.time)
          const size = k1.size + (k2.size - k1.size) * frameProgress
          
          setFontSize(size)
        }

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          setIsAnimating(false)
          setFontSize(30)
        }
      }

      requestAnimationFrame(animate)
      prevValue.current = value
    }
  }, [value])

  return (
    <div 
      style={{ 
        fontSize: `${fontSize}px`,
        transformOrigin: 'bottom'
      }}
      className={cn(
        "font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent",
        "drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]",
        "transition-transform duration-150",
        isAnimating && "animate-[scoreUpdate_0.8s_cubic-bezier(0.34,1.56,0.64,1)]",
        "will-change-[transform]",
        className
      )}
    >
      {animatedValue}
    </div>
  )
} 