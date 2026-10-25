'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import { Link, usePathname } from '@/i18n/navigation'

/** The magnifier left of the language button (「IFAI 首页」board); marked current on the search page. */
export function SearchLink() {
  const t = useTranslations('header')
  const current = usePathname() === '/search'

  return (
    <Link
      href="/search"
      aria-label={t('search')}
      aria-current={current ? 'page' : undefined}
      className="flex size-11 flex-none items-center justify-center text-ink transition-colors hover:text-accent-ink"
    >
      <Icon name="search" size={20} />
    </Link>
  )
}
