import { cn } from '@/lib/utils/cn'
import Image from 'next/image'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-20 h-20 text-2xl'
  }

  if (src) {
    return (
      <div className={cn(
        'relative rounded-full overflow-hidden',
        sizeClasses[size],
        className
      )}>
        <Image
          src={src}
          alt={`${name}'s avatar`}
          fill
          className="object-cover"
        />
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500/50 to-pink-500/50 text-white font-medium',
      sizeClasses[size],
      className
    )}>
      {getInitials(name)}
    </div>
  )
} 