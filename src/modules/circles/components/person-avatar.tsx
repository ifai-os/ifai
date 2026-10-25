import { tileTones } from '@/components/cards/initial-tile'

const sizes = {
  xs: 'size-5 text-micro',
  sm: 'size-9 text-ui',
  md: 'size-10 text-ui',
  /** On a member's page. */
  xl: 'size-24 text-display',
} as const

/** A member's first letter on their tile tone, until members can upload a picture (docs/specs/circles.md rule 7). */
export function PersonAvatar({ name, tone, size = 'md', className }: { name: string; tone: number; size?: keyof typeof sizes; className?: string }) {
  const initial = ([...name.trim()][0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-pill font-semibold ${sizes[size]} ${tileTones[tone % tileTones.length]} ${className ?? ''}`}
    >
      {initial}
    </span>
  )
}
