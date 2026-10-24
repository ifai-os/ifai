"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import { storyHref } from "../list-params";
import type { StoryItem, StoryMedia, StoryPicture } from "../story-item";
import { VideoDialog } from "./video-dialog";

/** The round play mark over a video's cover. */
function PlayMark({ size }: { size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-1/2 left-1/2 flex -translate-1/2 items-center justify-center rounded-pill bg-black/55 text-white backdrop-blur-sm transition-transform group-hover:scale-110 ${
        size === "lg" ? "size-16" : "size-10"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={size === "lg" ? "size-7" : "size-4.5"}
        fill="currentColor"
      >
        <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
      </svg>
    </span>
  );
}

/** A cover, or for a video without one a dark tile, filling its box. */
function Cover({
  picture,
  sizes,
}: {
  picture: StoryPicture | null;
  sizes: string;
}) {
  if (!picture) return <span className="absolute inset-0 bg-night" />;
  return (
    <Image
      src={picture.url}
      alt=""
      fill
      sizes={sizes}
      className="object-cover"
    />
  );
}

/** Opens the story's video in a dialog. */
function VideoButton({
  media,
  story,
  className,
  sizes,
  wide,
}: {
  media: Extract<StoryMedia, { kind: "video" }>;
  story: Pick<StoryItem, "title">;
  className: string;
  sizes: string;
  wide?: boolean;
}) {
  const t = useTranslations("daily");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("playVideo", { title: story.title.value })}
        className={`group relative overflow-hidden ${className}`}
      >
        <Cover picture={media.picture} sizes={sizes} />
        <PlayMark size={wide ? "lg" : "sm"} />
      </button>
      <VideoDialog
        video={media.video}
        title={story.title.value}
        lang={story.title.lang}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const thumbBox =
  "relative block aspect-[16/10] w-24 flex-none rounded-tile bg-surface-2 md:w-50";

/** The list's thumbnail (「IFAI 日报（新版）」): a picture links to the story, a video plays in place. */
export function StoryThumb({
  story,
}: {
  story: Pick<StoryItem, "slug" | "title" | "media">;
}) {
  const media = story.media;
  if (!media) return null;
  const sizes = "(min-width: 768px) 200px, 96px";
  if (media.kind === "video")
    return (
      <VideoButton
        media={media}
        story={story}
        className={thumbBox}
        sizes={sizes}
      />
    );
  return (
    <Link
      href={storyHref(story.slug)}
      tabIndex={-1}
      aria-hidden="true"
      className={`overflow-hidden ${thumbBox}`}
    >
      <Cover picture={media.picture} sizes={sizes} />
    </Link>
  );
}

/** The story page's picture or video, with its credit underneath. */
export function StoryFigure({
  story,
}: {
  story: Pick<StoryItem, "title" | "media">;
}) {
  const t = useTranslations("daily");
  const media = story.media;
  if (!media) return null;
  const box = "relative block aspect-video w-full rounded-card bg-surface-2";
  const sizes = "(min-width: 768px) 720px, 100vw";
  return (
    <figure className="flex flex-col gap-2">
      {media.kind === "video" ? (
        <VideoButton
          media={media}
          story={story}
          className={box}
          sizes={sizes}
          wide
        />
      ) : (
        <span className={`overflow-hidden ${box}`}>
          <Image
            src={media.picture.url}
            alt={story.title.value}
            fill
            sizes={sizes}
            className="object-cover"
            priority
          />
        </span>
      )}
      {media.credit && (
        <figcaption className="text-small text-ink-4">
          {t("imageCredit", { name: media.credit })}
        </figcaption>
      )}
    </figure>
  );
}
