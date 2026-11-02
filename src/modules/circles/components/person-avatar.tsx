import { tileTones } from '@/components/cards/initial-tile'

const sizes = {
  xs: 'size-5 text-micro',
  sm: 'size-9 text-ui',
  md: 'size-10 text-ui',
} as const

/** An agent's tile is square, as on the settings page, so it does not pass for a person's. */
const squares: Record<keyof typeof sizes, string> = { xs: 'rounded-tag', sm: 'rounded-tile', md: 'rounded-tile' }

/**
 * A member's first letter on their tile tone, until members can upload a picture
 * (docs/specs/circles.md rule 7); an agent's (`square`) on a square tile.
 */
export function PersonAvatar({
  name,
  tone,
  size = 'md',
  square = false,
  className,
}: {
  name: string
  tone: number
  size?: keyof typeof sizes
  square?: boolean
  className?: string
}) {
  const initial = ([...name.trim()][0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center font-semibold ${square ? squares[size] : 'rounded-pill'} ${sizes[size]} ${tileTones[tone % tileTones.length]} ${className ?? ''}`}
    >
      {initial}
    </span>
  )
}
