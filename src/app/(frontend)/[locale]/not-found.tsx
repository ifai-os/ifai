import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

/** 404 from the「空状态与加载状态」board: the big number is decoration, the two links are the most common ways out. */
export default function NotFound() {
  const t = useTranslations('notFound')

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col items-center gap-3.5 px-4 pt-20 pb-24 text-center">
      <span className="text-display leading-none tracking-[-0.02em] text-disabled" aria-hidden="true">
        404
      </span>
      <div className="flex max-w-70 flex-col gap-1.5">
        <h1 className="text-title font-semibold">{t('title')}</h1>
        <p className="text-meta text-ink-4">{t('body')}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-ui font-medium">
        <Link href="/" className="flex min-h-11 items-center text-link">
          {t('back')}
        </Link>
        <Link href="/daily" className="flex min-h-11 items-center text-link">
          {t('daily')}
        </Link>
      </div>
    </main>
  )
}
