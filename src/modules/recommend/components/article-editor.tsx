'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'

import { Button, buttonClass } from '@/components/button'
import { Icon } from '@/components/icon'
import { Link, useRouter } from '@/i18n/navigation'

import type { UploadedImage } from '../images'
import { prepareImage } from '../prepare-image'
import { articleChannels, articleHref, maxSummaryLength, maxTitleLength, type ArticleChannel, type ArticleStatus, type RichText } from '../rules'
import type { ArticleDraft } from '../write'
import { imageMarkdown, writeRules, type WriteError } from '../writing'
import { ArticleBody } from './article-body'

const field =
  'w-full rounded-thumb border border-surface-2 bg-surface px-4 text-ui text-ink outline-none placeholder:text-ink-4 focus:border-ink-4 aria-[invalid]:border-down'

type UploadError = WriteError | 'type' | 'too-big' | 'network'
/** `recommend.write.errors.*`: what the API said, or what went wrong on the way. */
type EditorError = UploadError | 'image-daily-limit'
type Preview = { state: 'loading' } | { state: 'ready'; body: RichText; lang: string } | { state: 'failed'; error: WriteError | 'network' }

async function upload(file: File): Promise<{ ok: true; image: UploadedImage } | { ok: false; error: UploadError }> {
  const prepared = await prepareImage(file)
  if (!prepared.ok) return prepared
  const form = new FormData()
  form.set('file', prepared.blob, 'picture')
  try {
    const response = await fetch('/api/recommend/images', { method: 'POST', body: form })
    const json = (await response.json().catch(() => ({}))) as { image?: UploadedImage; error?: WriteError }
    return response.ok && json.image ? { ok: true, image: json.image } : { ok: false, error: json.error ?? 'invalid-request' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

/**
 * The writing page (docs/specs/recommend.md「写文章」): title, summary, channel, tags and cover,
 * then the Markdown with「写 / 预览」and「插入图片」; a draft can be saved, and an article
 * published, changed or taken back to a draft.
 */
export function ArticleEditor({ draft }: { draft: ArticleDraft | null }) {
  const t = useTranslations('recommend.write')
  const channelNames = useTranslations('recommend.channels')
  const locale = useLocale()
  const router = useRouter()
  const ids = { title: useId(), summary: useId(), channel: useId(), tags: useId(), body: useId(), error: useId() }

  const [id, setId] = useState<number | null>(draft?.id ?? null)
  const [status, setStatus] = useState<ArticleStatus>(draft?.status ?? 'draft')
  const [title, setTitle] = useState(draft?.title ?? '')
  const [summary, setSummary] = useState(draft?.summary ?? '')
  const [channel, setChannel] = useState<ArticleChannel | ''>(draft?.channel ?? '')
  const [tags, setTags] = useState(draft?.tags.join(', ') ?? '')
  const [markdown, setMarkdown] = useState(draft?.markdown ?? '')
  const [cover, setCover] = useState<UploadedImage | null>(draft?.cover ?? null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'cover' | 'image' | 'draft' | 'publish' | null>(null)
  const [error, setError] = useState<{ key: EditorError; field?: 'title' | 'channel' | 'body' } | null>(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const body = useRef<HTMLTextAreaElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setDirty(true)
      setSaved(false)
    }

  function showError(code: EditorError) {
    const fieldOf: Partial<Record<EditorError, 'title' | 'channel' | 'body'>> = {
      'title-empty': 'title',
      'title-too-long': 'title',
      'invalid-channel': 'channel',
      'body-empty': 'body',
      'body-too-long': 'body',
      'image-source': 'body',
      'image-line': 'body',
    }
    setError({ key: code, field: fieldOf[code] })
  }

  async function pickCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('cover')
    const result = await upload(file)
    setBusy(null)
    if (!result.ok) return showError(result.error === 'daily-limit' ? 'image-daily-limit' : result.error)
    edit(setCover)(result.image)
  }

  async function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('image')
    const result = await upload(file)
    setBusy(null)
    if (!result.ok) return showError(result.error === 'daily-limit' ? 'image-daily-limit' : result.error)
    // On a line of its own where the cursor is, with blank lines around it.
    const area = body.current
    const at = area ? area.selectionEnd : markdown.length
    const before = markdown.slice(0, at).replace(/\n*$/, '')
    const after = markdown.slice(at).replace(/^\n*/, '')
    const line = imageMarkdown(result.image.url)
    const next = `${before}${before ? '\n\n' : ''}${line}\n\n${after}`
    edit(setMarkdown)(next)
    setTab('write')
    requestAnimationFrame(() => {
      const caret = before.length + (before ? 2 : 0) + 2
      body.current?.focus()
      body.current?.setSelectionRange(caret, caret)
    })
  }

  async function showPreview() {
    setTab('preview')
    setPreview({ state: 'loading' })
    try {
      const response = await fetch('/api/recommend/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, title, locale }),
      })
      const json = (await response.json().catch(() => ({}))) as { body?: RichText; lang?: string; error?: WriteError }
      setPreview(response.ok && json.body ? { state: 'ready', body: json.body, lang: json.lang ?? locale } : { state: 'failed', error: json.error ?? 'invalid-request' })
    } catch {
      setPreview({ state: 'failed', error: 'network' })
    }
  }

  async function save(publish: boolean) {
    setError(null)
    setSaved(false)
    setBusy(publish ? 'publish' : 'draft')
    try {
      const response = await fetch(id === null ? '/api/recommend/articles' : `/api/recommend/articles?id=${id}`, {
        method: id === null ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary, channel, tags, markdown, cover: cover?.id ?? null, publish, locale }),
      })
      const json = (await response.json().catch(() => ({}))) as { id?: number; status?: ArticleStatus; error?: WriteError }
      if (!response.ok || !json.id) {
        setBusy(null)
        return showError(json.error ?? 'invalid-request')
      }
      setDirty(false)
      if (publish) {
        router.push(articleHref(json.id))
        return
      }
      setBusy(null)
      setStatus(json.status ?? 'draft')
      setSaved(true)
      if (id === null) {
        setId(json.id)
        router.replace(`/recommend/write/${json.id}`)
      }
    } catch {
      setBusy(null)
      showError('network')
    }
  }

  const published = status === 'published'
  const invalid = (name: 'title' | 'channel' | 'body') => (error?.field === name ? true : undefined)
  const describedBy = (name: 'title' | 'channel' | 'body') => (error?.field === name ? ids.error : undefined)

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col gap-6 px-4 pt-6 pb-16 md:pt-10 md:pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-h2 md:text-h1">{id === null ? t('newTitle') : t('editTitle')}</h1>
        <Link href="/me/articles" className="text-meta text-ink-3 hover:text-ink">
          {t('mine')}
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.title} className="text-meta font-medium text-ink-2">
          {t('title')}
        </label>
        <input
          id={ids.title}
          value={title}
          onChange={(event) => edit(setTitle)(event.target.value)}
          maxLength={maxTitleLength}
          aria-invalid={invalid('title')}
          aria-describedby={describedBy('title')}
          className={`${field} h-12 text-title`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.summary} className="text-meta font-medium text-ink-2">
          {t('summary')} <span className="font-normal text-ink-4">{t('optional')}</span>
        </label>
        <input
          id={ids.summary}
          value={summary}
          onChange={(event) => edit(setSummary)(event.target.value)}
          maxLength={maxSummaryLength}
          placeholder={t('summaryHint')}
          className={`${field} h-11`}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col gap-2 sm:w-56">
          <label htmlFor={ids.channel} className="text-meta font-medium text-ink-2">
            {t('channel')}
          </label>
          <select
            id={ids.channel}
            value={channel}
            onChange={(event) => edit(setChannel)(event.target.value as ArticleChannel | '')}
            aria-invalid={invalid('channel')}
            aria-describedby={describedBy('channel')}
            className={`${field} h-11 px-3`}
          >
            <option value="">{t('pickChannel')}</option>
            {articleChannels.map((value) => (
              <option key={value} value={value}>
                {channelNames(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={ids.tags} className="text-meta font-medium text-ink-2">
            {t('tags')} <span className="font-normal text-ink-4">{t('optional')}</span>
          </label>
          <input id={ids.tags} value={tags} onChange={(event) => edit(setTags)(event.target.value)} placeholder={t('tagsHint')} className={`${field} h-11`} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-meta font-medium text-ink-2">
          {t('cover')} <span className="font-normal text-ink-4">{t('optional')}</span>
        </span>
        {cover ? (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- the member's own upload, served as it is */}
            <img src={cover.url} alt="" width={cover.width || undefined} height={cover.height || undefined} className="aspect-[2/1] w-full rounded-thumb border border-hairline object-cover" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => coverInput.current?.click()} disabled={busy !== null}>
                {busy === 'cover' ? t('uploading') : t('changeCover')}
              </Button>
              <Button variant="secondary" onClick={() => edit(setCover)(null)} disabled={busy !== null}>
                {t('removeCover')}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            disabled={busy !== null}
            className="flex aspect-[4/1] w-full flex-col items-center justify-center gap-1 rounded-thumb border border-dashed border-line text-meta text-ink-3 hover:border-ink-4 hover:text-ink disabled:opacity-60"
          >
            <Icon name="upload" size={20} />
            {busy === 'cover' ? t('uploading') : t('addCover')}
          </button>
        )}
        <input ref={coverInput} type="file" accept="image/*" hidden onChange={pickCover} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={ids.body} className="text-meta font-medium text-ink-2">
            {t('body')}
          </label>
          <div role="tablist" aria-label={t('bodyTabs')} className="flex gap-1 text-meta">
            {(['write', 'preview'] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                onClick={() => (name === 'preview' ? void showPreview() : setTab('write'))}
                className={`h-8 rounded-pill px-3 ${tab === name ? 'bg-ink text-bg' : 'text-ink-3 hover:text-ink'}`}
              >
                {t(name)}
              </button>
            ))}
          </div>
        </div>
        <textarea
          id={ids.body}
          ref={body}
          value={markdown}
          onChange={(event) => edit(setMarkdown)(event.target.value)}
          placeholder={t('bodyHint')}
          aria-invalid={invalid('body')}
          aria-describedby={describedBy('body')}
          hidden={tab !== 'write'}
          spellCheck
          className={`${field} min-h-[60vh] resize-y py-3 font-mono leading-[1.7]`}
        />
        {tab === 'preview' && (
          <div aria-live="polite" className="min-h-[60vh] rounded-thumb border border-surface-2 px-4 py-6 md:px-8">
            {preview?.state === 'ready' ? (
              preview.body?.root?.children?.length ? (
                <ArticleBody body={preview.body} lang={preview.lang} ugc />
              ) : (
                <p className="text-ui text-ink-4">{t('previewEmpty')}</p>
              )
            ) : preview?.state === 'failed' ? (
              <p role="alert" className="text-ui text-down">
                {t(`errors.${preview.error}`, { max: writeRules.maxMarkdown })}
              </p>
            ) : (
              <p className="text-ui text-ink-4">{t('previewLoading')}</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-small text-ink-4">
          <span>{t('formats')}</span>
          <button
            type="button"
            onClick={() => imageInput.current?.click()}
            disabled={busy !== null}
            className="flex min-h-9 items-center gap-1.5 text-meta text-ink-2 hover:text-ink disabled:opacity-60"
          >
            <Icon name="upload" size={16} />
            {busy === 'image' ? t('uploading') : t('insertImage')}
          </button>
          <input ref={imageInput} type="file" accept="image/*" hidden onChange={pickImage} />
        </div>
      </div>

      {error && (
        <p id={ids.error} role="alert" className="text-small text-down">
          {t(`errors.${error.key}`, { max: writeRules.maxMarkdown, articles: writeRules.dailyArticles, images: writeRules.dailyImages })}
        </p>
      )}
      {saved && (
        <p role="status" className="text-small text-ink-3">
          {t('saved')}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-surface-2 pt-6">
        {published ? (
          <>
            <Button variant="secondary" onClick={() => void save(false)} disabled={busy !== null}>
              {busy === 'draft' ? t('saving') : t('unpublish')}
            </Button>
            <Button onClick={() => void save(true)} disabled={busy !== null}>
              {busy === 'publish' ? t('saving') : t('saveChanges')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => void save(false)} disabled={busy !== null}>
              {busy === 'draft' ? t('saving') : t('saveDraft')}
            </Button>
            <Button onClick={() => void save(true)} disabled={busy !== null}>
              {busy === 'publish' ? t('publishing') : t('publish')}
            </Button>
          </>
        )}
      </div>
      {id !== null && published && (
        <Link href={articleHref(id)} className={buttonClass('secondary', 'self-start')}>
          {t('view')}
        </Link>
      )}
    </main>
  )
}
