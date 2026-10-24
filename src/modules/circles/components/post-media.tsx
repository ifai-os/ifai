'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'

import { Icon } from '@/components/icon'

import { formatDuration } from '../media/links'
import type { PostImage, VideoView } from '../rules'

/** Pictures are already sized WebP copies on IFAI: no optimizing to do. */
function Picture(props: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- the sizes are made on upload; alt comes in props
  return <img loading="lazy" decoding="async" {...props} />
}

/**
 * A post's pictures (docs/specs/circles.md「设计稿」): one alone keeps its own shape (between 3:4
 * and 16:9, at most 360 px tall); two and four go in pairs; three and five to nine in rows of
 * three. Pressing one opens the viewer.
 */
export function PostImages({ images }: { images: PostImage[] }) {
  const t = useTranslations('circles')
  const [open, setOpen] = useState<number | null>(null)
  const count = images.length
  const tile = 'block overflow-hidden rounded-thumb bg-surface-2'
  const label = (index: number) => t('viewImage', { index: index + 1, count })

  let grid
  if (count === 1) {
    const [image] = images
    const ratio = Math.min(16 / 9, Math.max(3 / 4, image.width / image.height || 1))
    const width = Math.round(Math.min(360, 480 / ratio) * ratio)
    grid = (
      <button type="button" onClick={() => setOpen(0)} aria-label={label(0)} className={tile} style={{ width: `min(100%, ${width}px)`, aspectRatio: ratio }}>
        <Picture src={image.feed} alt="" width={image.width} height={image.height} className="size-full object-cover" />
      </button>
    )
  } else {
    grid = (
      <ul className={`grid gap-1 ${count === 2 || count === 4 ? 'max-w-80 grid-cols-2' : 'max-w-120 grid-cols-3'}`}>
        {images.map((image, index) => (
          <li key={image.id}>
            <button type="button" onClick={() => setOpen(index)} aria-label={label(index)} className={`${tile} aspect-square w-full`}>
              <Picture src={image.square} alt="" width={400} height={400} className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      {grid}
      <ImageViewer images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </>
  )
}

/** The pictures one at a time, as large as the screen takes: ← →, swiping, and Esc or a press beside the picture to close. */
function ImageViewer({ images, index, onIndex, onClose }: { images: PostImage[]; index: number | null; onIndex: (index: number) => void; onClose: () => void }) {
  const t = useTranslations('circles')
  const states = useTranslations('states')
  const ref = useRef<HTMLDialogElement>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const open = index !== null

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const image = index === null ? null : images[index]
  const go = (step: number) => {
    if (index === null) return
    const next = index + step
    if (next >= 0 && next < images.length) onIndex(next)
  }
  const arrow = 'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-pill bg-white/15 text-white hover:bg-white/25'

  return (
    <dialog
      ref={ref}
      aria-label={t('imageViewer')}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(-1)
        if (event.key === 'ArrowRight') go(1)
      }}
      className="m-0 size-full max-h-none max-w-none bg-transparent p-0 text-white backdrop:bg-black/90"
    >
      {image && index !== null && (
        <div className="flex size-full flex-col">
          <div className="flex h-14 flex-none items-center justify-between px-4">
            <p aria-live="polite" className="text-meta">
              {images.length > 1 && t('imageCounter', { index: index + 1, count: images.length })}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label={states('dismiss')}
              autoFocus
              className="flex size-10 items-center justify-center rounded-pill hover:bg-white/15"
            >
              <Icon name="close" size={20} strokeWidth={2} />
            </button>
          </div>
          <div
            className="relative min-h-0 flex-1 touch-pan-y px-4 pb-4 sm:px-18"
            onClick={(event) => event.target === event.currentTarget && onClose()}
            onPointerDown={(event) => (swipe.current = { x: event.clientX, y: event.clientY })}
            onPointerUp={(event) => {
              const start = swipe.current
              swipe.current = null
              if (!start) return
              const dx = event.clientX - start.x
              if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(event.clientY - start.y)) go(dx < 0 ? 1 : -1)
            }}
          >
            <span className="absolute inset-x-4 top-0 bottom-4 sm:inset-x-18">
              <Picture
                key={image.id}
                src={image.full}
                alt={t('imageNumber', { index: index + 1 })}
                width={image.width}
                height={image.height}
                loading="eager"
                draggable={false}
                className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
              />
            </span>
            {index > 0 && (
              <button type="button" onClick={() => go(-1)} aria-label={t('previousImage')} className={`${arrow} left-3`}>
                <Icon name="chevronLeft" size={22} strokeWidth={2} />
              </button>
            )}
            {index < images.length - 1 && (
              <button type="button" onClick={() => go(1)} aria-label={t('nextImage')} className={`${arrow} right-3`}>
                <Icon name="chevronRight" size={22} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}

/**
 * A video link (docs/specs/circles.md rule 13): the cover kept on IFAI with the length on it, and
 * the title linking to the video's own page. The site's player is put in only when the reader
 * presses play, so reading the feed tells the video site nothing. When nothing could be read
 * about the video, a plain link.
 */
export function PostVideo({ video }: { video: VideoView }) {
  const t = useTranslations('circles')
  const [playing, setPlaying] = useState(false)
  const site = t(`providers.${video.provider}`)
  const link = { href: video.url, target: '_blank', rel: 'nofollow ugc noopener noreferrer' }

  if (!video.title) {
    return (
      <a {...link} className="flex max-w-120 items-center gap-3 rounded-tile border border-surface-2 bg-surface px-3.5 py-3 hover:border-line">
        <Icon name="video" size={20} className="flex-none text-ink-3" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-meta font-medium">{t('watchOn', { site })}</span>
          <span className="truncate text-small text-ink-4">{video.url}</span>
        </span>
        <Icon name="external" size={16} className="flex-none text-ink-4" />
      </a>
    )
  }

  return (
    <div className="flex max-w-120 flex-col overflow-hidden rounded-tile border border-surface-2 bg-bg">
      <div className="relative aspect-video bg-night">
        {playing ? (
          <iframe
            src={video.embed}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            className="absolute inset-0 size-full"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={t('playVideo', { title: video.title })} className="group absolute inset-0 block size-full">
            {video.cover && <Picture src={video.cover} alt="" className="size-full object-cover" />}
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 flex size-14 -translate-1/2 items-center justify-center rounded-pill bg-white/95 text-black shadow-float group-hover:scale-105"
            >
              <Icon name="play" size={24} />
            </span>
            {video.duration !== null && (
              <span className="absolute right-2 bottom-2 rounded-tag bg-black/70 px-1.5 py-0.5 text-small font-medium text-white">{formatDuration(video.duration)}</span>
            )}
          </button>
        )}
      </div>
      <a {...link} className="flex flex-col gap-0.5 px-3.5 py-3 hover:bg-surface">
        <span className="line-clamp-2 text-ui font-medium">{video.title}</span>
        <span className="flex items-center gap-1 text-small text-ink-4">
          {[site, video.channel].filter(Boolean).join(' · ')}
          <Icon name="external" size={12} />
        </span>
      </a>
    </div>
  )
}
