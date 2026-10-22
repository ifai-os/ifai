'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { ButtonLink } from '@/components/button'
import { LoadFailed } from '@/components/states/load-failed'

type Props = {
  error: unknown
  retry: () => void
}

/** Error boundary for every page under /[locale]. Header and footer stay; the page body becomes「加载失败，点此重试」. */
export default function LocaleError({ error, retry }: Props) {
  const t = useTranslations('states')

  useEffect(() => {
    // Error monitoring (Sentry) is wired in later; until then the console is the log.
    console.error(error)
  }, [error])

  return (
    <main id="main" className="mx-auto w-full max-w-read px-4 pt-12 pb-24">
      <LoadFailed onRetry={retry} title={t('errorTitle')} body={t('errorBody')}>
        <ButtonLink href="/" variant="secondary">
          {t('home')}
        </ButtonLink>
      </LoadFailed>
    </main>
  )
}
