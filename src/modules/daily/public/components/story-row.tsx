"use client";

import { useTranslations } from "next-intl";

import { LocalTime } from "@/components/local-time";
import { Link } from "@/i18n/navigation";

import type { StoryItem } from "../story-item";
import { storyHref } from "../list-params";
import { StoryThumb } from "./story-media";

/**
 * One story in the list (「IFAI 日报（新版）」board): local time, category, other reports; title;
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
  const t = useTranslations("daily");
  const card = useTranslations("card");

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
              className="font-medium text-accent tabular-nums"
            />
            <span>{category}</span>
            <span>{card("moreSources", { count: story.moreReports })}</span>
          </p>
          <h3 lang={story.title.lang} className="text-title md:text-h3">
            <Link
              href={storyHref(story.slug)}
              className="text-ink hover:text-accent"
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
        {/* Beside the try-it too on wide screens, so it follows the summary rather than the picture. */}
        <StoryThumb
          story={story}
          className={story.tryIt ? "md:row-span-2" : ""}
        />
        {story.tryIt && (
          <p
            lang={story.tryIt.lang}
            className="col-span-full rounded-thumb bg-surface px-3.5 py-2.5 text-meta leading-5.25 text-ink-2 md:col-span-1"
          >
            <span className="me-2 font-medium text-accent">{t("tryIt")}</span>{" "}
            {story.tryIt.value}
          </p>
        )}
      </article>
    </li>
  );
}
