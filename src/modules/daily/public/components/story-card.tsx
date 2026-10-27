import { Link } from '@/i18n/navigation'

import type { StoryItem } from '../story-item'
import { storyHref } from '../list-params'
import { SpreadIndex } from './spread-index'
import { StoryTime } from './story-time'

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
}

/**
 * One story on a topic or category page (「IFAI 公司与产品话题页」「IFAI 日报 · 分类页」boards): the
 * reader's local day and time, then a white card with the reach index, the title, at most
 * three lines of summary.
 */
export function StoryCard({ story, serverToday, category }: StoryCardProps) {
  return (
    <li className="flex flex-col gap-2.5">
      <StoryTime iso={story.publishedAt} serverToday={serverToday} />
      <article className="flex flex-col gap-3 rounded-card bg-bg px-5 py-5 md:px-7 md:py-6">
        {(category || story.spread > 0) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-4">
            {category && <span>{category}</span>}
            <SpreadIndex value={story.spread} />
          </p>
        )}
        <h2 lang={story.title.lang} className="text-h3">
          <Link href={storyHref(story.slug)} className="hover:text-accent-ink">
            {story.title.value}
          </Link>
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
