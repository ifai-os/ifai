"use client";

import { Link } from "@/i18n/navigation";

import type { StoryItem } from "../story-item";
import { listHref, storyHref } from "../list-params";
import { SpreadIndex } from "./spread-index";
import { StoryThumb } from "./story-media";
import { StoryClock } from "./story-time";

/**
 * One story in the list, laid out like sspai.com's list (站长, 2026-11-07): on the left the title at
 * the top, then the summary, and the meta line (local time, category, reach index) at the bottom;
 * on the right its picture or video, 4 : 3. With a picture the text column is the picture's height:
 * title and summary stop at two lines each (the story page has the rest) and the meta line sits on
 * the picture's bottom edge.
 */
export function StoryRow({
  story,
  category,
}: {
  story: StoryItem;
  category: string;
}) {
  return (
    <li>
      <article
        className={`grid gap-x-4 border-t border-hairline py-4 md:gap-x-12 md:py-6 ${
          story.media ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"
        }`}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <h3 lang={story.title.lang} className={`text-title md:text-h3 ${story.media ? "line-clamp-2" : ""}`}>
            <Link
              href={storyHref(story.slug)}
              className="text-ink hover:text-accent-ink"
            >
              {story.title.value}
            </Link>
          </h3>
          {story.summary && (
            <p
              lang={story.summary.lang}
              className={`text-body text-ink-3 ${story.media ? "line-clamp-2" : ""}`}
            >
              {story.summary.value}
            </p>
          )}
          <p className="mt-auto flex flex-wrap items-center gap-x-3 text-meta text-ink-4">
            <StoryClock
              iso={story.publishedAt}
              className="font-medium text-accent-ink tabular-nums"
            />
            <Link href={listHref({ category: story.category })} className="hover:text-ink">
              {category}
            </Link>
            <SpreadIndex value={story.spread} />
          </p>
        </div>
        <StoryThumb story={story} />
      </article>
    </li>
  );
}
