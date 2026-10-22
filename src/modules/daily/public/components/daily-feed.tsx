'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { DateBadge } from '@/components/cards/date-badge'
import { useReaderTimeZone, useReaderToday } from '@/components/local-time'
import { groupByDay, relativeDay } from '@/lib/local-time'

import type { StoryItem } from '../story-item'
import { StoryRow } from './story-row'

type DailyFeedProps = {
  /** Newest first. */
  stories: StoryItem[]
  /** Today's date on the server (UTC), so the first render matches on both sides. */
  serverToday: string
}

/** The stories grouped by the reader's calendar day: today, yesterday, then dated groups. */
export function DailyFeed({ stories, serverToday }: DailyFeedProps) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const today = useReaderToday(serverToday)
  const groups = groupByDay(stories, (story) => story.publishedAt, timeZone)

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => {
        const relative = relativeDay(group.key, today)
        const date = format.dateTime(group.date, { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' })
        return (
          <section key={group.key} aria-labelledby={`day-${group.key}`} className="flex flex-col gap-2">
            <header className="flex items-center gap-3">
              <DateBadge date={group.date} size="sm" />
              <div className="flex min-w-0 flex-col">
                <h2 id={`day-${group.key}`} className="text-h3 font-semibold">
                  {relative ? t(relative) : date}
                </h2>
                <span className="text-small text-ink-4">
                  {relative && <span>{date} · </span>}
                  {t('groupCount', { count: group.items.length })}
                </span>
              </div>
            </header>
            <ol>
              {group.items.map((story) => (
                <StoryRow key={story.id} story={story} category={names(story.category)} />
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
