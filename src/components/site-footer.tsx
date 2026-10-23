import { useTranslations } from 'next-intl'

import { Logo } from '@/components/brand/logo'
import { Link } from '@/i18n/navigation'
import { feedPath } from '@/modules/daily/public/list-params'
import { legalHref } from '@/modules/legal/documents'

export function SiteFooter() {
  const t = useTranslations('footer')

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-2 px-4 py-8 text-meta text-ink-4">
        <span className="flex items-center gap-2">
          <Logo size={20} />
          <span>{t('copyright', { year: new Date().getFullYear() })}</span>
        </span>
        <Link href={legalHref.privacy} className="hover:text-ink">
          {t('privacy')}
        </Link>
        <Link href={legalHref.terms} className="hover:text-ink">
          {t('terms')}
        </Link>
        <Link href={feedPath} className="hover:text-ink">
          {t('rss')}
        </Link>
      </div>
    </footer>
  )
}
