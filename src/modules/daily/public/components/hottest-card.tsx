import { MediaPicture } from '@/components/media-picture'
import { Link } from '@/i18n/navigation'

import type { HotStory } from '../story-item'
import { storyHref } from '../list-params'

/**
 * 「头条」(「IFAI 日报（新版）」board): the hottest story of the last 24 hours (else the hottest or
 * the newest there is, see ../data.ts `hottestStory`), the whole card a link to it. Its picture
 * (or video cover) is the backdrop, else its category's (public/news/hottest/). Title only: no
 * summary (站长, 2026-10-27) and no label line above it (站长, 2026-11-07). As on sspai.com, the
 * bottom of the picture blurs and darkens gradually under the title, so the title reads on any
 * picture and the top stays clear. Hovering zooms the picture a little instead of underlining.
 */
export function HottestCard({ story }: { story: HotStory }) {
  return (
    <section
      aria-labelledby="hottest-title"
      className="group relative isolate flex min-w-0 flex-col justify-end gap-2 overflow-hidden rounded-hero bg-night p-6 text-white min-h-60 md:min-h-80 md:grow-2 md:basis-100 md:p-8"
    >
      <MediaPicture
        picture={story.media?.picture ?? { url: `/news/hottest/${story.category}.webp` }}
        alt=""
        sizes="(min-width: 768px) 66vw, 100vw"
        className="-z-10 object-cover transition-transform duration-500 group-hover:scale-103 motion-reduce:transition-none"
      />
      {/* Progressive blur: one blurred layer whose mask fades it in from the middle down, then a dark wash for contrast. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-5 h-3/4 bg-linear-to-t from-black/60 from-15% to-black/0 backdrop-blur-2xl mask-t-from-35% mask-t-to-100%"
      />
      <div>
        <h2 id="hottest-title" lang={story.title.lang} className="text-h2 md:text-display-phone md:leading-9.75">
          <Link href={storyHref(story.slug)} className="text-white after:absolute after:inset-0">
            {story.title.value}
          </Link>
        </h2>
      </div>
    </section>
  )
}
