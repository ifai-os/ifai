"use client";

import { Link } from "@/i18n/navigation";

import type { StoryItem } from "../story-item";
import { listHref, storyHref } from "../list-params";
import { SpreadIndex } from "./spread-index";
import { StoryThumb } from "./story-media";
import { StoryClock } from "./story-time";

/**
 * One story in the list (「IFAI 日报（新版）」board, laid out like sspai.com's list): title, summary and
 * a meta line (local time, category, reach index) on the left; its picture or video on the right,
 * 3 : 2 and centred on the text, so the picture sits with the title instead of hanging off the
 * meta line. With a picture the summary stops at three lines; the story page has the rest.
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
        className={`grid items-center gap-x-4 border-t border-hairline py-4 md:gap-x-8 md:py-6 ${
          story.media ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"
        }`}
      >
        <div className="flex min-w-0 flex-col gap-2 md:gap-2.5">
          <h3 lang={story.title.lang} className="text-title md:text-h3">
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
              className={`text-body text-ink-3 ${story.media ? "line-clamp-3" : ""}`}
            >
              {story.summary.value}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-3 text-meta text-ink-4 md:pt-0.5">
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
