"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Icon } from "@/components/icon";

import { embedUrl, type Video } from "../../media";

type VideoDialogProps = {
  video: Video;
  /** The story's title, which names the dialog. */
  title: string;
  lang: string;
  open: boolean;
  onClose: () => void;
};

/**
 * The story's video in a modal (docs/specs/daily.md「配图与视频」). The player only exists while
 * the dialog is open, so nothing loads from YouTube or Vimeo before the click and closing stops it.
 */
export function VideoDialog({
  video,
  title,
  lang,
  open,
  onClose,
}: VideoDialogProps) {
  const states = useTranslations("states");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const embed = embedUrl(video);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      lang={lang}
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself, not on the player inside it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-240 overflow-visible bg-transparent p-0 backdrop:bg-black/80"
    >
      {open && (
        <div className="relative flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={states("dismiss")}
            className="flex size-10 items-center justify-center self-end rounded-pill bg-white/14 text-white hover:bg-white/24"
          >
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
          <div className="aspect-video w-full overflow-hidden rounded-card bg-black">
            {embed ? (
              <iframe
                src={embed}
                title={title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="size-full border-0"
              />
            ) : (
              <video
                src={video.provider === "file" ? video.url : undefined}
                controls
                autoPlay
                playsInline
                className="size-full"
              />
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
