'use client'

import { useTranslations } from 'next-intl'

import { LocalTime } from '@/components/local-time'
import { Link } from '@/i18n/navigation'

import type { StoryItem } from '../story-item'
import { storyHref } from '../list-params'

/** One story in the list (「IFAI 日报（新版）」board): local time, category, other reports; title; summary; try-it. */
export function StoryRow({ story, category }: { story: StoryItem; category: string }) {
  const t = useTranslations('daily')
  const card = useTranslations('card')

  return (
    <li>
      <article className="flex flex-col gap-1.5 border-t border-line py-4 md:py-5">
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-ink-4">
          <LocalTime iso={story.publishedAt} style="time" className="font-medium text-accent tabular-nums" />
          <span aria-hidden="true">·</span>
          <span>{category}</span>
          <span aria-hidden="true">·</span>
          <span>{card('moreSources', { count: story.moreReports })}</span>
        </p>
        <h3 lang={story.title.lang} className="text-title md:text-h3">
          <Link href={storyHref(story.slug)} className="text-ink hover:text-accent">
            {story.title.value}
          </Link>
        </h3>
        {story.summary && (
          <p lang={story.summary.lang} className="text-body text-ink-3">
            {story.summary.value}
          </p>
        )}
        {story.tryIt && (
          <p lang={story.tryIt.lang} className="mt-1 rounded-tile bg-surface px-3.5 py-2.5 text-ui text-ink-2">
            <span className="font-medium text-accent">{t('tryIt')}</span> {story.tryIt.value}
          </p>
        )}
      </article>
    </li>
  )
}
