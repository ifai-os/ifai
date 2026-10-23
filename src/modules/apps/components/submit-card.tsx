import { useTranslations } from 'next-intl'

import { ButtonLink } from '@/components/button'

import { submitHref } from '../list-params'

/** 「做了一个 AI 应用？」at the end of the list on phones (the「手机 · 应用列表」board); wider screens have the link in「热度怎么算」. */
export function SubmitCard() {
  const t = useTranslations('apps')

  return (
    <section aria-labelledby="submit-card" className="flex items-center gap-3.5 rounded-card border border-line p-4.5 md:hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="submit-card" className="text-title font-semibold text-balance">
          {t('submitCard.title')}
        </h2>
        <p className="text-meta text-ink-4">{t('submitCard.body')}</p>
      </div>
      <ButtonLink href={submitHref()} className="flex-none">
        {t('submitApp')}
      </ButtonLink>
    </section>
  )
}
