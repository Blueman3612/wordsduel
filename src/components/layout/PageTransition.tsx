'use client'

import { motion } from 'framer-motion'
import { useNavigation } from '@/lib/context/navigation'

interface PageTransitionProps {
  children: React.ReactNode
  className?: string
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
  const { direction } = useNavigation()

  const variants = {
    initial: {
      opacity: 0,
      x: direction === 'forward' ? '100%' : '-100%'
    },
    animate: {
      opacity: 1,
      x: 0
    },
    exit: {
      opacity: 0,
      x: direction === 'forward' ? '-100%' : '100%'
    }
  }

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
} 