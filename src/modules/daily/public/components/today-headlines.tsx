'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { DailyItemCard } from '@/components/cards/daily-item-card'
import { DateBadge } from '@/components/cards/date-badge'
import { useReaderTimeZone, useReaderToday } from '@/components/local-time'
import { Link } from '@/i18n/navigation'
import { dateOfKey, groupByDay } from '@/lib/local-time'

import type { StoryItem } from '../story-item'
import { storyHref } from '../list-params'

/** How many of today's stories the home page lists. */
export const headlinesShown = 5

type TodayHeadlinesProps = {
  /** The newest published stories, newest first. */
  stories: StoryItem[]
  /** Today's date on the server (UTC), so the first render matches on both sides. */
  serverToday: string
}

/**
 * 「今天的 AI」on the home page: the stories published on the reader's own today. Before the
 * first story of the day, the latest day with stories; before any story at all, a note.
 */
export function TodayHeadlines({ stories, serverToday }: TodayHeadlinesProps) {
  const t = useTranslations('home')
  const names = useTranslations('categories')
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const today = useReaderToday(serverToday)
  const groups = groupByDay(stories, (story) => story.publishedAt, timeZone)
  const group = groups.find((item) => item.key === today) ?? groups[0] ?? null
  const shown = group ? group.items.slice(0, headlinesShown) : []

  let meta = t('dailyEmpty')
  if (group && group.key === today) {
    const time = format.dateTime(new Date(group.items[0].publishedAt), { hour: 'numeric', minute: '2-digit', timeZone })
    meta = t('dailyMeta', { count: group.items.length, time })
  } else if (group) {
    const date = format.dateTime(group.date, { month: 'long', day: 'numeric', timeZone: 'UTC' })
    meta = t('dailyMetaPast', { date, count: group.items.length })
  }

  return (
    <>
      <div className="flex items-center gap-5">
        <DateBadge date={group ? group.date : dateOfKey(today)} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-display">{t('todayAI')}</h1>
          <span className="text-meta text-ink-4">{meta}</span>
        </div>
      </div>
      {shown.length > 0 && (
        <ol className="flex flex-col">
          {shown.map((story, index) => (
            <DailyItemCard
              key={story.id}
              href={storyHref(story.slug)}
              no={index + 1}
              category={names(story.category)}
              title={story.title.value}
              lang={story.title.lang}
            />
          ))}
        </ol>
      )}
      <Link href="/news" className="flex min-h-8 items-center self-start text-ui font-medium text-link">
        {t('readDaily')} ›
      </Link>
    </>
  )
}
