import { IntentLink } from '@/components/intent-link'
import { Link } from '@/i18n/navigation'

import { dateOnlyDay } from '../../date-only'
import type { StoryItem } from '../story-item'
import { listHref, storyHref } from '../list-params'
import { SpreadIndex } from './spread-index'
import { StoryClock, StoryDay } from './story-time'

const pillShape = 'inline-flex h-10 items-center rounded-pill border border-line bg-bg px-6 text-meta'

/** The topic and category pages' page links: earlier stories below the cards, newer ones above. */
export const pagePill = `${pillShape} text-ink-2 transition-colors hover:border-ink-4`

/** Where the earlier-stories link was, on the last page: the same pill in grey, as the boards draw it. */
export const pageEnd = `${pillShape} text-ink-4`

type StoryCardProps = {
  story: StoryItem
  serverToday: string
  /** The story's category by name; left out on its own category's page. */
  category?: string
  /** When the story before it on the page went up: the day shows once, above the first story of each day. */
  previousIso?: string
}

/**
 * One story on a topic or category page (「IFAI 公司与产品话题页」「IFAI 日报 · 分类页」boards): the
 * reader's local day above the first story of each day, then a white card with the time (none
 * when the story only knows its date), the category, the reach index, the title, at most three lines of summary.
 */
export function StoryCard({ story, serverToday, category, previousIso }: StoryCardProps) {
  return (
    <li className="flex flex-col gap-2.5">
      <StoryDay iso={story.publishedAt} previousIso={previousIso} serverToday={serverToday} />
      <article className="flex flex-col gap-3 rounded-card bg-bg px-5 py-5 md:px-7 md:py-6">
        {(!dateOnlyDay(story.publishedAt) || category || story.spread > 0) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-4">
            <StoryClock iso={story.publishedAt} className="font-medium text-accent-ink tabular-nums" />
            {category && (
              <Link href={listHref({ category: story.category })} className="hover:text-ink">
                {category}
              </Link>
            )}
            <SpreadIndex value={story.spread} />
          </p>
        )}
        <h2 lang={story.title.lang} className="text-h3">
          <IntentLink href={storyHref(story.slug)} className="hover:text-accent-ink">
            {story.title.value}
          </IntentLink>
        </h2>
        {story.summary && (
          <p lang={story.summary.lang} className="line-clamp-3 text-body text-ink-3">
            {story.summary.value}
          </p>
        )}
      </article>
    </li>
  )
}
