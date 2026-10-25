import { tileTones, toneFor } from '@/components/cards/initial-tile'
import { cleanName } from '@/modules/apps/reviews/rules'

/** Header button, account menu, settings page. */
const sizes = {
  sm: 'size-8 text-meta',
  md: 'size-11 text-title',
  lg: 'size-18 text-h1',
} as const

/** The name a member goes by: their nickname, or the part of their email before the @ while they have none. */
export function memberName(user: { name: string; email: string }): string {
  return cleanName(user.name) || user.email.split('@')[0]
}

/**
 * A member's avatar (docs/specs/account.md): the first character of their name, in a tone fixed
 * by their account id, the same as next to their reviews. No pictures yet.
 */
export function MemberAvatar({ userId, name, size }: { userId: string; name: string; size: keyof typeof sizes }) {
  const initial = ([...name.trim()][0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-pill font-semibold ${sizes[size]} ${tileTones[toneFor(userId)]}`}
    >
      {initial}
    </span>
  )
}
