import { useTranslations } from 'next-intl'

import { Logo } from '@/components/brand/logo'

/**
 * Who wrote it. In step 1 every article is the editors' (docs/specs/recommend.md 规则 1), shown
 * with the site's icon; step 2 puts the author's name and initial tile here.
 */
export function Byline({ size = 16 }: { size?: 16 | 24 }) {
  const t = useTranslations('recommend')
  return (
    <span className="flex items-center gap-2 text-ink-2">
      <span className="overflow-hidden rounded-pill">
        <Logo size={size} />
      </span>
      {t('editorial')}
    </span>
  )
}
