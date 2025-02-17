import { motion } from 'framer-motion'
import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

interface PageTransitionProps {
  children: ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  
  // Determine if we're going deeper into the app
  const isDeeper = pathname !== '/'

  const variants = {
    initial: {
      x: isDeeper ? '100%' : '-100%',
      opacity: 1
    },
    animate: {
      x: 0,
      opacity: 1,
      transition: {
        duration: 0.3,
        ease: [0.25, 1, 0.5, 1]
      }
    },
    exit: {
      x: isDeeper ? '-100%' : '100%',
      opacity: 1,
      transition: {
        duration: 0.3,
        ease: [0.25, 1, 0.5, 1]
      }
    }
  }

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full h-full"
    >
      {children}
    </motion.div>
  )
} 