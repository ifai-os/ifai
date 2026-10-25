/**
 * A story's picture or video (docs/specs/daily.md「配图与视频」). Pure: the extractor, the
 * writing step, the collection's validation and the pages all read videos through here.
 */

export const storyMediaKinds = ["none", "image", "video"] as const;
export type StoryMediaKind = (typeof storyMediaKinds)[number];

export type Video =
  | { provider: "youtube"; id: string }
  | { provider: "vimeo"; id: string }
  | { provider: "file"; url: string };

/** What the article page offered, as stored in `raw_items.media`. Addresses are absolute. */
export type FoundMedia = { image?: string; video?: Video };

const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const VIDEO_FILE = /\.(mp4|webm)$/i;

/** A YouTube, Vimeo or .mp4 / .webm address as a video; anything else is null. */
export function parseVideo(input: string | null | undefined): Video | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return youtube(parts[0]);
  if (
    host === "youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "music.youtube.com"
  ) {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v"));
    if (
      parts[0] === "embed" ||
      parts[0] === "shorts" ||
      parts[0] === "live" ||
      parts[0] === "v"
    )
      return youtube(parts[1]);
    return null;
  }
  if (host === "vimeo.com")
    return vimeo(parts.find((part) => VIMEO_ID.test(part)));
  if (host === "player.vimeo.com" && parts[0] === "video")
    return vimeo(parts[1]);
  if (VIDEO_FILE.test(url.pathname)) {
    url.hash = "";
    return { provider: "file", url: url.toString() };
  }
  return null;
}

function youtube(id: string | null | undefined): Video | null {
  return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
}

function vimeo(id: string | null | undefined): Video | null {
  return id && VIMEO_ID.test(id) ? { provider: "vimeo", id } : null;
}

/** The address an editor would paste for this video, and what `stories.media.videoUrl` keeps. */
export function videoUrl(video: Video): string {
  switch (video.provider) {
    case "youtube":
      return `https://www.youtube.com/watch?v=${video.id}`;
    case "vimeo":
      return `https://vimeo.com/${video.id}`;
    case "file":
      return video.url;
  }
}

/** The player inside the dialog, set to start at once. Null for files: those play in <video>. */
export function embedUrl(video: Video): string | null {
  switch (video.provider) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`;
    case "vimeo":
      return `https://player.vimeo.com/video/${video.id}?autoplay=1&dnt=1`;
    case "file":
      return null;
  }
}

/** Addresses that are almost always a site's chrome rather than the article's picture. */
const NOT_A_PICTURE =
  /(logo|icon|avatar|favicon|sprite|placeholder|default[-_]?(image|og|share)|blank|pixel)/i;

/** Whether an og:image is worth copying: not a logo, an SVG or a tracker, and wide enough when it says. */
export function usableImage(
  url: string | null | undefined,
  width?: number | null,
): url is string {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (/\.svg$/i.test(parsed.pathname)) return false;
  if (NOT_A_PICTURE.test(parsed.pathname)) return false;
  return !width || width >= 400;
}

/**
 * The picture and the video an article page offers (「自动取图」), read before Readability
 * rewrites the DOM: the first YouTube or Vimeo embed or link in the body, else og:video; then
 * og:image, else twitter:image.
 */
export function findMedia(document: Document, pageUrl: string): FoundMedia {
  const media: FoundMedia = {};
  const absolute = (value: string | null | undefined) => {
    if (!value) return null;
    try {
      return new URL(value.trim(), pageUrl).toString();
    } catch {
      return null;
    }
  };
  const content = (name: string) =>
    document
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute("content")
      ?.trim() || null;
  const meta = (name: string) => absolute(content(name));

  const body =
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.body;
  if (body) {
    for (const element of Array.from(
      body.querySelectorAll(
        "iframe[src], iframe[data-src], a[href], video source[src], video[src]",
      ),
    )) {
      const raw =
        element.getAttribute("src") ??
        element.getAttribute("data-src") ??
        element.getAttribute("href");
      const video = parseVideo(absolute(raw));
      // A link to a video file is a download, not the article's video; only embedded files count.
      if (
        video &&
        (video.provider !== "file" || element.tagName.toLowerCase() !== "a")
      ) {
        media.video = video;
        break;
      }
    }
  }
  if (!media.video) {
    const video = parseVideo(
      meta("og:video:secure_url") ?? meta("og:video:url") ?? meta("og:video"),
    );
    if (video) media.video = video;
  }

  const width = Number(content("og:image:width"));
  const image =
    meta("og:image:secure_url") ??
    meta("og:image") ??
    meta("twitter:image") ??
    meta("twitter:image:src");
  if (usableImage(image, Number.isFinite(width) && width > 0 ? width : null))
    media.image = image;

  return media;
}
