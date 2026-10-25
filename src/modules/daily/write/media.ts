import { inArray } from "@payloadcms/db-postgres/drizzle";

import { getDb } from "@/lib/db/drizzle";
import { errorMessage } from "@/modules/daily/collect/fetch";
import { fetchPublic, type FetchDeps } from "@/modules/apps/profile/fetch";
import {
  identifyImage,
  saveImage,
  type Image,
} from "@/modules/apps/profile/images";

import { type FoundMedia, type Video, videoUrl } from "../media";
import type { WriteReport } from "../prompts/write";
import { rawItems } from "../schema";

/**
 * A new story's picture or video (docs/specs/daily.md「配图与视频」「自动取图」): taken from
 * the reports in source-list order, the picture copied into Media so pages only read our own
 * files. No model is called; a download that fails leaves the story without one.
 */

const IMAGE_ACCEPT =
  "image/avif, image/webp, image/png, image/jpeg, image/gif;q=0.8";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 400;
const keptTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type MediaCandidate = { sourceName: string; media: FoundMedia };

/** What the story shows: a video from any report first, else the first picture. */
export function pickMedia(
  candidates: MediaCandidate[],
): { video?: Video; image?: string; credit: string } | null {
  const withVideo = candidates.find((candidate) => candidate.media.video);
  if (withVideo)
    return {
      video: withVideo.media.video,
      image: withVideo.media.image,
      credit: withVideo.sourceName,
    };
  const withImage = candidates.find((candidate) => candidate.media.image);
  return withImage
    ? { image: withImage.media.image, credit: withImage.sourceName }
    : null;
}

/** The reports' media, in the order the story lists its sources (background reports left out). */
export async function mediaCandidates(
  reports: WriteReport[],
): Promise<MediaCandidate[]> {
  const listed = reports.filter((report) => !report.background);
  if (!listed.length) return [];
  const { db } = await getDb();
  const rows = await db
    .select({ url: rawItems.url, media: rawItems.media })
    .from(rawItems)
    .where(
      inArray(
        rawItems.url,
        listed.map((report) => report.url),
      ),
    );
  const byUrl = new Map(rows.map((row) => [row.url, row.media]));
  return listed.flatMap((report) => {
    const media = byUrl.get(report.url);
    return media && (media.image || media.video)
      ? [{ sourceName: report.sourceName, media }]
      : [];
  });
}

/** A picture worth showing: a JPEG, PNG, WebP or GIF at least 400 px wide. */
async function downloadImage(
  url: string,
  deps: FetchDeps,
): Promise<Image | null> {
  const { bytes } = await fetchPublic(
    url,
    { accept: IMAGE_ACCEPT, maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15_000 },
    deps,
  );
  const image = await identifyImage(bytes);
  if (
    !image ||
    !keptTypes.has(image.mimeType) ||
    (image.width ?? 0) < MIN_IMAGE_WIDTH
  )
    return null;
  return image;
}

/** Cover addresses to try for a video, best first; a file uses the article's own picture. */
export async function coverUrls(
  video: Video,
  articleImage: string | undefined,
  deps: FetchDeps = {},
): Promise<string[]> {
  switch (video.provider) {
    case "youtube":
      return [
        `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      ];
    case "vimeo": {
      try {
        const oembed = `https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(videoUrl(video))}`;
        const { bytes } = await fetchPublic(
          oembed,
          {
            accept: "application/json",
            maxBytes: 64 * 1024,
            timeoutMs: 10_000,
          },
          deps,
        );
        const data = JSON.parse(new TextDecoder().decode(bytes)) as {
          thumbnail_url?: unknown;
        };
        const cover =
          typeof data.thumbnail_url === "string" ? [data.thumbnail_url] : [];
        return articleImage ? [...cover, articleImage] : cover;
      } catch {
        return articleImage ? [articleImage] : [];
      }
    }
    case "file":
      return articleImage ? [articleImage] : [];
  }
}

export type StoryMediaData = {
  kind: "none" | "image" | "video";
  image?: number | null;
  videoUrl?: string | null;
  credit?: string | null;
};

/**
 * The `media` group for a new story. A video keeps its address even when no cover downloads; a
 * picture that does not download leaves the story without media. Failures are reported, not thrown.
 */
export async function storyMedia(
  candidates: MediaCandidate[],
  { alt, name }: { alt: string; name: string },
  deps: FetchDeps = {},
): Promise<{ data: StoryMediaData; problems: string[] }> {
  const { payload } = await getDb();
  const picked = pickMedia(candidates);
  if (!picked) return { data: { kind: "none" }, problems: [] };

  const problems: string[] = [];
  const tryCopy = async (urls: string[]): Promise<number | null> => {
    for (const url of urls) {
      try {
        const image = await downloadImage(url, deps);
        if (image) return await saveImage(payload, image, { alt, name });
        problems.push(`${url}: not a usable picture`);
      } catch (error) {
        problems.push(`${url}: ${errorMessage(error)}`);
      }
    }
    return null;
  };

  if (picked.video) {
    const image = await tryCopy(
      await coverUrls(picked.video, picked.image, deps),
    );
    return {
      data: {
        kind: "video",
        videoUrl: videoUrl(picked.video),
        image,
        credit: picked.credit,
      },
      problems,
    };
  }
  const image = await tryCopy(picked.image ? [picked.image] : []);
  return {
    data: image
      ? { kind: "image", image, credit: picked.credit }
      : { kind: "none" },
    problems,
  };
}
