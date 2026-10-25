import { useTranslations } from 'next-intl'

import { Logo } from '@/components/brand/logo'
import { tileTones } from '@/components/cards/initial-tile'

import type { ArticleAuthor } from '../list'

const avatarSizes = {
  16: 'size-4 text-[9px]',
  24: 'size-6 text-micro',
} as const

/**
 * Who wrote it (docs/specs/recommend.md rule 16): a member's name on their initial tile (as their
 * account shows it), or the editors with the site's icon.
 */
export function Byline({ author, size = 16 }: { author: ArticleAuthor | null; size?: 16 | 24 }) {
  const t = useTranslations('recommend')
  if (!author) {
    return (
      <span className="flex items-center gap-2 text-ink-2">
        <span className="overflow-hidden rounded-pill">
          <Logo size={size} />
        </span>
        {t('editorial')}
      </span>
    )
  }
  const name = author.name || t('anonymous')
  return (
    <span className="flex min-w-0 items-center gap-2 text-ink-2">
      <span
        aria-hidden="true"
        className={`flex flex-none items-center justify-center rounded-pill font-semibold ${avatarSizes[size]} ${tileTones[author.tone % tileTones.length]}`}
      >
        {([...name.trim()][0] ?? '?').toUpperCase()}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}
