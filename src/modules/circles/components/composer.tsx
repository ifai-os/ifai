'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'

import { buttonClass } from '@/components/button'
import { toneFor } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'
import { cleanText, textLength } from '@/modules/apps/reviews/rules'

import { formatDuration } from '../media/links'
import { prepareImage, type PrepareError } from '../media/prepare'
import { circleRules, mediaRules, type VideoView } from '../rules'
import { useCircles, type PublishResult } from './circles-provider'
import { PersonAvatar } from './person-avatar'

type FormError =
  | 'circle'
  | 'body'
  | 'tooLong'
  | 'dailyLimit'
  | 'gone'
  | 'failed'
  | 'tooManyImages'
  | 'imageType'
  | 'imageTooBig'
  | 'gifTooBig'
  | 'imageDailyLimit'
  | 'imagesUploading'
  | 'imagesFailed'
  | 'imagesGone'
  | 'videoUnsupported'
  | 'videoDailyLimit'
  | 'videoFailed'
  | 'videoGone'

const errorOf: Partial<Record<PublishResult, FormError>> = {
  'invalid-circle': 'circle',
  'empty-body': 'body',
  'body-too-long': 'tooLong',
  'daily-limit': 'dailyLimit',
  'not-found': 'gone',
  'too-many-images': 'tooManyImages',
  'invalid-images': 'imagesGone',
  'invalid-video': 'videoGone',
}

const prepareErrors: Record<PrepareError, FormError> = { type: 'imageType', 'too-big': 'imageTooBig', 'gif-too-big': 'gifTooBig' }

/** What the error messages quote. */
const limits = {
  max: circleRules.maxBody,
  limit: circleRules.dailyPosts,
  images: mediaRules.maxImages,
  dailyImages: mediaRules.dailyImages,
  dailyVideos: mediaRules.dailyVideos,
  pickedMb: mediaRules.maxPickedBytes / 2 ** 20,
  gifMb: mediaRules.maxUploadBytes / 2 ** 20,
}

/** A picture in the post being written: shown from the reader's own file until it is uploaded. */
type DraftImage = { key: number; file: File; preview: string; status: 'sending' | 'sent' | 'failed'; id: number | null }

/**
 * 「发布动态」: the text, pictures (picked, pasted or dropped; uploaded one by one as they are
 * added), a video link, and the circle it goes to. Visitors see the same box; pressing anything
 * asks them to sign in. Polls are not here (docs/specs/circles.md「设计稿」).
 */
export function Composer() {
  const t = useTranslations('circles')
  const { circles, byId, circle, joined, signedIn, sessionPending, member, publish, uploadImage, askToSignIn } = useCircles()
  const [draft, setDraft] = useState('')
  const [chosen, setChosen] = useState<number | null>(null)
  const [error, setError] = useState<FormError | null>(null)
  const [sending, setSending] = useState(false)
  const [images, setImages] = useState<DraftImage[]>([])
  const [video, setVideo] = useState<VideoView | null>(null)
  const [videoOpen, setVideoOpen] = useState(false)
  const fieldId = useId()
  const errorId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const nextKey = useRef(0)
  /** Uploads go one at a time, in the order the pictures were added. */
  const queue = useRef<Promise<void>>(Promise.resolve())
  /** The previews to let go of when the page goes away. */
  const previews = useRef(new Set<string>())

  useEffect(() => {
    const urls = previews.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  // The circle being looked at, else the first one they joined; their own pick wins.
  const target = chosen ?? circle?.id ?? joined.find((id) => byId.has(id)) ?? null
  const length = textLength(draft)
  const tooLong = length > circleRules.maxBody
  const name = member?.name.trim() || t('anonymous')

  if (circles.length === 0) return null

  const update = (key: number, change: Partial<DraftImage>) =>
    setImages((current) => current.map((image) => (image.key === key ? { ...image, ...change } : image)))

  const drop = (key: number) =>
    setImages((current) =>
      current.filter((image) => {
        if (image.key !== key) return true
        URL.revokeObjectURL(image.preview)
        previews.current.delete(image.preview)
        return false
      }),
    )

  /** Shrinks the picture if it needs it and sends it; a picture the server will never take is taken out again. */
  async function send(image: DraftImage) {
    update(image.key, { status: 'sending' })
    const prepared = await prepareImage(image.file)
    if (!prepared.ok) {
      drop(image.key)
      setError(prepareErrors[prepared.error])
      return
    }
    const result = await uploadImage(prepared.blob)
    if (result.ok) return update(image.key, { status: 'sent', id: result.id })
    const lasting: Partial<Record<string, FormError>> = { 'invalid-image': 'imageType', 'too-large': 'imageTooBig', 'daily-limit': 'imageDailyLimit' }
    const reason = lasting[result.error]
    if (reason) {
      drop(image.key)
      setError(reason)
    } else update(image.key, { status: 'failed' })
  }

  function addFiles(files: File[]) {
    if (!signedIn) {
      askToSignIn('post')
      return
    }
    const room = mediaRules.maxImages - images.length
    const added = files.slice(0, Math.max(room, 0)).map((file): DraftImage => {
      const preview = URL.createObjectURL(file)
      previews.current.add(preview)
      return { key: ++nextKey.current, file, preview, status: 'sending', id: null }
    })
    setError(files.length > room ? 'tooManyImages' : null)
    if (added.length === 0) return
    setImages((current) => [...current, ...added])
    for (const image of added) queue.current = queue.current.then(() => send(image))
  }

  const imageFiles = (list: FileList | null | undefined) => [...(list ?? [])].filter((file) => file.type.startsWith('image/'))

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFiles(event.clipboardData.files)
    if (files.length === 0) return
    // A screenshot comes as a file alone; copied text that brings a picture along still pastes its text.
    if (!event.clipboardData.getData('text')) event.preventDefault()
    addFiles(files)
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    const files = imageFiles(event.dataTransfer.files)
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!signedIn) {
      askToSignIn('post')
      return
    }
    const body = cleanText(draft)
    if (target === null) return setError('circle')
    if (images.some((image) => image.status === 'sending')) return setError('imagesUploading')
    if (images.some((image) => image.status === 'failed')) return setError('imagesFailed')
    if (!body && images.length === 0 && !video) return setError('body')
    if (textLength(body) > circleRules.maxBody) return setError('tooLong')
    setError(null)
    setSending(true)
    const result = await publish(target, body, { images: images.flatMap((image) => (image.id ? [image.id] : [])), video: video?.id ?? null })
    setSending(false)
    if (result === 'ok') {
      setDraft('')
      for (const image of images) drop(image.key)
      setVideo(null)
      setVideoOpen(false)
      return
    }
    if (result !== 'sign-in') setError(errorOf[result] ?? 'failed')
  }

  const iconButton = 'flex size-9 items-center justify-center rounded-btn text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60 aria-pressed:bg-line'
  const textError = error === 'body' || error === 'tooLong'

  return (
    <form
      onSubmit={submit}
      onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
      onDrop={onDrop}
      aria-label={t('composerLabel')}
      className="flex flex-col gap-3 rounded-hero border border-surface-2 bg-surface px-4 py-4 sm:px-5"
    >
      <div className="flex items-start gap-3">
        {member ? <PersonAvatar name={name} tone={toneFor(member.id)} /> : <span aria-hidden="true" className="size-10 flex-none rounded-pill bg-disabled" />}
        <label htmlFor={fieldId} className="sr-only">
          {t('composerLabel')}
        </label>
        {signedIn || sessionPending ? (
          <textarea
            id={fieldId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (textError) setError(null)
            }}
            onPaste={onPaste}
            disabled={sessionPending}
            placeholder={t('placeholder')}
            aria-invalid={textError || tooLong}
            aria-describedby={error ? errorId : undefined}
            rows={3}
            className="min-h-18 flex-1 resize-y rounded-tile border border-surface-2 bg-bg px-3.5 py-3 text-body placeholder:text-ink-4"
          />
        ) : (
          // Visitors: the same box, as a button that asks them to sign in first.
          <button
            id={fieldId}
            type="button"
            onClick={() => askToSignIn('post')}
            className="min-h-18 flex-1 rounded-tile border border-surface-2 bg-bg px-3.5 py-3 text-left text-body text-ink-4"
          >
            {t('placeholder')}
          </button>
        )}
      </div>
      {images.length > 0 && <DraftImages images={images} onRemove={drop} onRetry={(image) => (queue.current = queue.current.then(() => send(image)))} />}
      {video ? (
        <DraftVideo video={video} onRemove={() => setVideo(null)} />
      ) : (
        videoOpen && (
          <VideoField
            onVideo={(found) => {
              setVideo(found)
              setVideoOpen(false)
              if (error === 'body' || error?.startsWith('video')) setError(null)
            }}
            onError={setError}
            onCancel={() => setVideoOpen(false)}
          />
        )
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:pl-13">
        <div className="flex flex-wrap items-center gap-1">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              addFiles([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => (signedIn ? fileInput.current?.click() : askToSignIn('post'))}
            disabled={sessionPending || images.length >= mediaRules.maxImages}
            aria-label={t('addImages')}
            title={t('addImages')}
            className={iconButton}
          >
            <Icon name="image" size={18} />
          </button>
          <button
            type="button"
            onClick={() => (signedIn ? setVideoOpen(!videoOpen) : askToSignIn('post'))}
            disabled={sessionPending || video !== null}
            aria-pressed={video !== null || videoOpen}
            aria-label={t('addVideo')}
            title={t('addVideo')}
            className={iconButton}
          >
            <Icon name="video" size={18} />
          </button>
          <label className="ml-1 flex min-h-9 items-center gap-1.5 text-meta text-ink-2">
            <span>{t('postTo')}</span>
            <select
              value={target ?? ''}
              onChange={(event) => {
                setChosen(event.target.value ? Number(event.target.value) : null)
                if (error === 'circle') setError(null)
              }}
              disabled={!signedIn}
              aria-invalid={error === 'circle'}
              className="h-9 max-w-52 rounded-thumb border border-line bg-bg px-2 text-meta text-ink disabled:opacity-60"
            >
              {target === null && <option value="">{t('pickCircle')}</option>}
              {circles.map((item) => (
                <option key={item.id} value={item.id}>
                  # {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          {signedIn && length > 0 && (
            <span className={`text-small ${tooLong ? 'font-medium text-down' : 'text-ink-4'}`}>
              {t('charCount', { count: length, max: circleRules.maxBody })}
            </span>
          )}
          <button type="submit" disabled={sending || sessionPending} className={buttonClass('primary', 'h-9 px-5 disabled:opacity-60')}>
            {sending ? t('publishing') : t('publish')}
          </button>
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-small text-down sm:pl-13">
          {t(`errors.${error}`, limits)}
        </p>
      )}
    </form>
  )
}

/** The pictures being added: each with「移除」, a note while it uploads, and「重试」when it did not. */
function DraftImages({ images, onRemove, onRetry }: { images: DraftImage[]; onRemove: (key: number) => void; onRetry: (image: DraftImage) => void }) {
  const t = useTranslations('circles')
  return (
    <ul aria-label={t('draftImages', { count: images.length, max: mediaRules.maxImages })} className="flex flex-wrap gap-2 sm:pl-13">
      {images.map((image, index) => (
        <li key={image.key} className="relative size-18 flex-none overflow-hidden rounded-thumb border border-hairline bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- the reader's own file, shown before it is uploaded */}
          <img src={image.preview} alt={t('imageNumber', { index: index + 1 })} className={`size-full object-cover ${image.status === 'sent' ? '' : 'opacity-50'}`} />
          {image.status === 'sending' && (
            <span role="status" className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-micro text-white">
              {t('uploading')}
            </span>
          )}
          {image.status === 'failed' && (
            <button type="button" onClick={() => onRetry(image)} className="absolute inset-x-0 bottom-0 bg-down py-0.5 text-center text-micro font-medium text-bg">
              {t('retryUpload')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(image.key)}
            aria-label={t('removeImage', { index: index + 1 })}
            className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-pill bg-black/60 text-white hover:bg-black/80"
          >
            <Icon name="close" size={12} strokeWidth={2.4} />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 「添加视频链接」: paste the address, and the card comes back from the server. */
function VideoField({ onVideo, onError, onCancel }: { onVideo: (video: VideoView) => void; onError: (error: FormError) => void; onCancel: () => void }) {
  const t = useTranslations('circles')
  const { lookUpVideo } = useCircles()
  const [url, setUrl] = useState('')
  const [reading, setReading] = useState(false)
  const inputId = useId()

  async function read() {
    if (!url.trim() || reading) return
    setReading(true)
    const result = await lookUpVideo(url.trim())
    setReading(false)
    if (result.ok) return onVideo(result.video)
    const reasons: Partial<Record<string, FormError>> = { 'unsupported-video': 'videoUnsupported', 'daily-limit': 'videoDailyLimit' }
    if (result.error !== 'sign-in') onError(reasons[result.error] ?? 'videoFailed')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:pl-13">
      <label htmlFor={inputId} className="sr-only">
        {t('videoLink')}
      </label>
      <input
        id={inputId}
        type="url"
        inputMode="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        // Enter reads the link; it would otherwise send the post.
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void read()
          }
          if (event.key === 'Escape') onCancel()
        }}
        placeholder={t('videoPlaceholder')}
        autoFocus
        className="h-9 min-w-0 flex-1 basis-60 rounded-thumb border border-line bg-bg px-3 text-meta text-ink placeholder:text-ink-4"
      />
      <button type="button" onClick={read} disabled={reading || !url.trim()} className={buttonClass('secondary', 'h-9 px-4 disabled:opacity-60')}>
        {reading ? t('videoReading') : t('videoAdd')}
      </button>
      <button type="button" onClick={onCancel} className="h-9 px-1 text-meta text-link hover:underline">
        {t('cancel')}
      </button>
    </div>
  )
}

/** The video in the post being written: cover, title,「YouTube · 12:48」and「移除视频」. */
function DraftVideo({ video, onRemove }: { video: VideoView; onRemove: () => void }) {
  const t = useTranslations('circles')
  const site = t(`providers.${video.provider}`)
  return (
    <div className="flex items-center gap-3 rounded-tile border border-surface-2 bg-bg p-2.5 sm:ml-13">
      <span className="relative h-13.5 w-24 flex-none overflow-hidden rounded-thumb bg-night">
        {video.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- kept on IFAI, sized by the box
          <img src={video.cover} alt="" className="size-full object-cover" />
        )}
        <span aria-hidden="true" className="absolute top-1/2 left-1/2 flex size-6.5 -translate-1/2 items-center justify-center rounded-pill bg-black/60 text-white">
          <Icon name="play" size={12} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-meta font-medium">{video.title ?? video.url}</span>
        <span className="text-small text-ink-4">
          {video.title ? [site, video.duration ? formatDuration(video.duration) : null].filter(Boolean).join(' · ') : t('videoNoInfo', { site })}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('removeVideo')}
        className="flex size-7 flex-none items-center justify-center rounded-pill bg-surface-2 text-ink-2 hover:text-ink"
      >
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
