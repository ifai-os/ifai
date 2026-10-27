"use client";

import { LocalTime } from "@/components/local-time";
import { Link } from "@/i18n/navigation";

import type { StoryItem } from "../story-item";
import { storyHref } from "../list-params";
import { SpreadIndex } from "./spread-index";
import { StoryThumb } from "./story-media";

/**
 * One story in the list (「IFAI 日报（新版）」board): local time, category, reach index; title;
 * summary; try-it; and 28 to the right its picture or video when it has one. Phones put the
 * try-it under both.
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
        className={`grid gap-x-4 gap-y-3 border-t border-hairline py-4 md:gap-x-7 md:py-6 ${
          story.media ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"
        }`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3 text-meta text-ink-4">
            <LocalTime
              iso={story.publishedAt}
              style="time"
              className="font-medium text-accent-ink tabular-nums"
            />
            <span>{category}</span>
            <SpreadIndex value={story.spread} />
          </p>
          <h3 lang={story.title.lang} className="text-title md:text-h3">
            <Link
              href={storyHref(story.slug)}
              className="text-ink hover:text-accent-ink"
            >
              {story.title.value}
            </Link>
          </h3>
          {story.summary && (
            <p lang={story.summary.lang} className="text-body text-ink-3">
              {story.summary.value}
            </p>
          )}
        </div>
        <StoryThumb story={story} />
      </article>
    </li>
  );
}
