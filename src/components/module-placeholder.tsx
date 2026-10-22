import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import type { ModuleKey } from '@/config/site'
import { Link } from '@/i18n/navigation'

/** Temporary page for a module that is being built. */
export function ModulePlaceholder({ module }: { module: ModuleKey }) {
  const t = useTranslations()

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col items-start gap-4 px-4 pt-20 pb-24">
      <span className="rounded-tag bg-warn px-2 py-0.5 text-small font-medium text-warn-ink">
        {t('placeholder.badge')}
      </span>
      <h1 className="text-h1">{t(`nav.${module}`)}</h1>
      <p className="text-body text-ink-2">{t(`modules.${module}`)}</p>
      <p className="text-body text-ink-3">{t('placeholder.body')}</p>
      <Link href="/" className="mt-2 flex min-h-11 items-center gap-1.5 text-ui font-medium text-link">
        <Icon name="arrowLeft" size={16} />
        {t('placeholder.back')}
      </Link>
    </main>
  )
}
