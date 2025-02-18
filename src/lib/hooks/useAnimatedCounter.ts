import { useState, useEffect } from 'react'

export function useAnimatedCounter(targetValue: number, duration: number = 1000, fps: number = 60) {
  const [currentValue, setCurrentValue] = useState(targetValue)

  useEffect(() => {
    // Don't animate if the target is the same as current
    if (targetValue === currentValue) return

    const startValue = currentValue
    const difference = targetValue - startValue
    const totalFrames = Math.floor(duration / (1000 / fps))
    let currentFrame = 0
    
    const timer = setInterval(() => {
      currentFrame++
      
      // Use easeOutQuart easing function for a nice deceleration
      const progress = 1 - Math.pow(1 - currentFrame / totalFrames, 4)
      
      // Calculate the next value
      const nextValue = Math.round(startValue + difference * progress)
      
      setCurrentValue(nextValue)
      
      // Stop the animation when we reach the target or exceed frames
      if (currentFrame >= totalFrames) {
        setCurrentValue(targetValue)
        clearInterval(timer)
      }
    }, 1000 / fps)

    return () => clearInterval(timer)
  }, [targetValue, duration, fps])

  return currentValue
} 