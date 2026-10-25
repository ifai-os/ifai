'use client'

import { useTranslations } from 'next-intl'

import { useStoryDay } from './story-time'

type CategoryMetaProps = {
  week: number
  /** When the category's newest story went up. */
  latest: string
  serverToday: string
  className: string
}

/** The category banner's「近 7 天 21 条 · 最近更新 17:05」: the time in the reader's zone, with the day unless it is today. */
export function CategoryMeta({ week, latest, serverToday, className }: CategoryMetaProps) {
  const t = useTranslations('daily')
  const { day, time, relative } = useStoryDay(latest, serverToday)
  return (
    <p className={className}>
      {t('categoryWeek', { count: week })}
      <span aria-hidden="true"> · </span>
      <time dateTime={latest}>{t('categoryUpdated', { when: relative ?? 'date', date: day, time })}</time>
    </p>
  )
}
