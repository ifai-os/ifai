import { useTranslations } from 'next-intl'

import { AccountButton } from '@/components/account-button'
import { Logo } from '@/components/brand/logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NavLink } from '@/components/nav-link'
import { SearchLink, WriteLink } from '@/components/search-link'
import { isLaunched, visibleNavItems } from '@/config/site'
import { Link } from '@/i18n/navigation'

export function SiteHeader() {
  const t = useTranslations()
  const items = visibleNavItems()

  return (
    <header className="sticky top-0 z-20 bg-bg shadow-divider">
      <div className="mx-auto flex min-h-14 max-w-nav flex-wrap items-center justify-between gap-x-6 px-4">
        <Link
          href="/"
          aria-label={t('header.home')}
          className="flex min-w-30 flex-1 items-center gap-2 text-ink"
        >
          <Logo size={32} eager />
          <span className="text-h3 leading-none font-semibold tracking-[0.02em]">IFAI</span>
        </Link>

        {/* Phones: the nav drops to its own scrollable row under the logo. */}
        <nav
          aria-label={t('nav.label')}
          className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-x-6 overflow-x-auto px-4 text-ui md:order-none md:mx-0 md:w-auto md:flex-wrap md:justify-center md:overflow-visible md:px-0"
        >
          {items.map((item) => (
            <NavLink key={item.key} href={item.href} icon={item.icon}>
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="flex min-w-30 flex-1 items-center justify-end gap-1">
          {isLaunched('recommend') && <WriteLink />}
          <SearchLink />
          <LanguageSwitcher />
          <AccountButton />
        </div>
      </div>
    </header>
  )
}
