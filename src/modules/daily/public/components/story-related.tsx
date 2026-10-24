import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { Link } from '@/i18n/navigation'

import type { StoryTag } from '../../tags'
import type { StoryEntityItem, StoryItem, StoryTopic } from '../story-item'
import { listHref, storyHref } from '../list-params'
import { ShowMoreList } from './show-more'

/** 「话题追踪」shows this many before「查看更多」. */
const topicFirst = 5

/**
 * The story page's related blocks (「IFAI 资讯详情页 · v1」board; docs/specs/daily.md
 * 「详情页：行业标签、公司与产品、话题追踪、同类事件」). Following tags, companies and topics is
 * not built yet, so the board's「关注」buttons are left out.
 */

/**「话题追踪」: stories about the same product or company as a timeline, newest first, this one marked. */
export function TopicTrack({ topic, currentId }: { topic: StoryTopic; currentId: number }) {
  const t = useTranslations('daily')
  const rows = topic.stories.map((story) => {
    const current = story.id === currentId
    return (
      // Phones put the date over the title, so the title keeps the width.
      <li key={story.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 md:grid-cols-[112px_20px_minmax(0,1fr)]">
        <LocalTime iso={story.publishedAt} style="date" className="hidden py-2 text-meta text-ink-4 tabular-nums md:block" />
        <span aria-hidden="true" className="relative flex justify-center">
          <span className="w-px bg-line" />
          <span
            className={`absolute top-3.5 size-3 rounded-pill border-2 ${current ? 'border-accent bg-accent' : 'border-mute bg-bg'}`}
          />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-body">
          <LocalTime iso={story.publishedAt} style="date" className="w-full text-meta text-ink-4 tabular-nums md:hidden" />
          {current ? (
            <span lang={story.title.lang} aria-current="page" className="font-semibold">
              {story.title.value}
            </span>
          ) : (
            <Link href={storyHref(story.slug)} lang={story.title.lang} className="text-ink-2 hover:text-accent">
              {story.title.value}
            </Link>
          )}
          {current && <span className="rounded-tag bg-ink px-1.5 text-small font-medium text-white">{t('thisStory')}</span>}
        </span>
      </li>
    )
  })
  const hidden = rows.length - topicFirst

  return (
    <section aria-labelledby="topic" className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 id="topic" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-h2">
        <Icon name="clock" size={20} className="text-accent" />
        {t('topic')}
        <span className="text-body font-normal text-ink-4">{topic.name}</span>
      </h2>
      <p className="text-meta text-ink-4">{t('topicNote')}</p>
      <ShowMoreList
        rows={rows}
        shown={topicFirst}
        className="flex flex-col"
        labels={{ more: t('showMore', { count: Math.max(hidden, 0) }), less: t('showLess') }}
      />
    </section>
  )
}

/**「同类事件」: similar stories of other events, for context. */
export function SimilarStories({ stories }: { stories: StoryItem[] }) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  return (
    <section aria-labelledby="similar" className="flex flex-col gap-3">
      <h2 id="similar" className="text-h2">
        {t('similar')}
      </h2>
      <p className="text-meta text-ink-4">{t('similarNote')}</p>
      <ul className="flex flex-col">
        {stories.map((story) => (
          <li key={story.id} className="border-t border-surface-2">
            <Link href={storyHref(story.slug)} className="group grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-3">
              <LocalTime iso={story.publishedAt} style="date" className="text-meta text-ink-4 tabular-nums" />
              <span className="flex flex-col gap-1">
                <span lang={story.title.lang} className="text-body font-medium group-hover:text-accent">
                  {story.title.value}
                </span>
                <span className="text-small text-ink-4">{names(story.category)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**「行业标签」: each links to the stories with that tag. */
export function TagList({ tags }: { tags: StoryTag[] }) {
  const t = useTranslations('daily')
  const names = useTranslations('tags')
  return (
    <section aria-labelledby="tags" className="flex flex-col gap-2.5">
      <h2 id="tags" className="text-body font-semibold">
        {t('tags')}
      </h2>
      <ul className="flex flex-col rounded-tile border border-line px-4 py-1">
        {tags.map((tag, index) => (
          <li key={tag} className={index ? 'border-t border-line' : undefined}>
            <Link href={listHref({ tag })} className="flex min-h-11 items-center justify-between gap-2 text-ui hover:text-accent">
              {names(tag)}
              <span aria-hidden="true" className="text-ink-4">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**「涉及的公司与产品」: an initial tile, the name and its kind; an app page when the app is on the site. */
export function EntityList({ entities }: { entities: StoryEntityItem[] }) {
  const t = useTranslations('daily')
  return (
    <section aria-labelledby="entities" className="flex flex-col gap-2.5">
      <h2 id="entities" className="text-body font-semibold">
        {t('entities')}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {entities.map((entity) => (
          <li key={`${entity.kind}-${entity.name}`} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 flex-none items-center justify-center rounded-thumb border border-surface-2 bg-surface text-ui font-semibold"
              >
                {Array.from(entity.name)[0]?.toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ui font-medium">{entity.name}</span>
                <span className="text-small text-ink-4">{t(`entityKinds.${entity.kind}`)}</span>
              </span>
            </span>
            {entity.app && (
              <Link
                href={`/apps/${entity.app.slug}`}
                className="inline-flex h-8 flex-none items-center rounded-pill border border-line px-3 text-small text-ink-2 hover:border-ink-4"
              >
                {t('appPage')}
                <span className="sr-only">: {entity.app.name}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
