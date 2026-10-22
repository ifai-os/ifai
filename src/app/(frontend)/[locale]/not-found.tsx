import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import { Link } from '@/i18n/navigation'

export default function NotFound() {
  const t = useTranslations('notFound')

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col items-start gap-4 px-4 pt-20 pb-24">
      <span className="text-h1 text-mute" aria-hidden="true">
        404
      </span>
      <h1 className="text-h1">{t('title')}</h1>
      <p className="text-body text-ink-3">{t('body')}</p>
      <Link href="/" className="mt-2 flex min-h-11 items-center gap-1.5 text-ui font-medium text-link">
        <Icon name="arrowLeft" size={16} />
        {t('back')}
      </Link>
    </main>
  )
}
