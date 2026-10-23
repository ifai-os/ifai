'use client'

import { Button, Pill, toast, useConfig, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { storyCategories, type StoryCategory } from '../../categories'
import {
  SUMMARY_MAX,
  TITLE_MAX,
  hansHash,
  localeStates,
  localesToRewrite,
  nextAfter,
  primaryDecision,
  primaryEnabled,
  queueFlags,
  rewrittenLocales,
  stillMissing,
  textLength,
  type LocaleState,
  type QueueFlag,
  type RewrittenLocale,
} from '../../review/rules'
import type { AssistKind, Edits, QueueItem, ReviewDetail, ReviewQueue } from '../../review/types'
import type { PosterDesk } from '../../poster/types'
import { ApiError, reviewApi } from './api'
import { PosterColumn } from './poster-column'
import { localeNames, reviewText, type ReviewText } from './text'
import './review.css'

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted'
type Note = { text: string; tone: Tone }
type Busy = 'publish' | 'correct' | 'reject' | 'later' | 'withdraw' | 'merge' | 'keep' | 'rewrite' | 'assist' | null

/** The story on the right: its loaded detail, the editor's text and what it was when loaded. */
type Editor = { id: number; detail: ReviewDetail; edits: Edits; baseline: Edits }

const flagStyle: Record<QueueFlag['kind'], 'light' | 'light-gray' | 'warning' | 'error'> = {
  more: 'light',
  duplicate: 'warning',
  unverified: 'warning',
  failed: 'error',
  gap: 'warning',
  promotional: 'error',
  tutorial: 'light-gray',
  later: 'light-gray',
  withdrawn: 'light-gray',
}

function editsOf(detail: ReviewDetail): Edits {
  return {
    title: detail.hans.title,
    summary: detail.hans.summary,
    tryIt: detail.hans.tryIt,
    category: detail.category,
    sources: detail.sources.map((source) => ({ ...source })),
  }
}

function sameEdits(a: Edits | null, b: Edits | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function flagsOfItem(item: QueueItem): QueueFlag[] {
  return queueFlags({
    status: item.status,
    moreReports: item.moreReports,
    duplicate: Boolean(item.duplicate),
    unverified: item.unverified,
    failedLocales: item.failedLocales,
    scoreA: item.scoreA,
    scoreB: item.scoreB,
    flags: item.flags,
    laterAt: item.laterAt,
  })
}

function flagText(flag: QueueFlag, t: ReviewText): string {
  switch (flag.kind) {
    case 'more':
      return t.flags.more(flag.count)
    case 'duplicate':
      return t.flags.duplicate
    case 'unverified':
      return t.flags.unverified
    case 'failed':
      return t.flags.failed(flag.locales.map((locale) => localeNames[locale]).join(t.join))
    case 'gap':
      return t.flags.gap(flag.points)
    case 'promotional':
      return t.flags.promotional
    case 'tutorial':
      return t.flags.tutorial
    case 'later':
      return t.flags.later
    case 'withdrawn':
      return t.flags.withdrawn
  }
}

function clip(text: string, max = 14): string {
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}

type Props = { initial: ReviewQueue; initialStoryId?: number }

export function ReviewScreen({ initial, initialStoryId }: Props) {
  const { config } = useConfig()
  const { i18n } = useTranslation()
  const t = reviewText(i18n.language)
  const api = useMemo(() => reviewApi(config.routes.api), [config.routes.api])
  const adminRoute = config.routes.admin
  const language = i18n.language

  const time = useCallback(
    (iso: string | null | undefined) => {
      if (!iso) return ''
      const date = new Date(iso)
      const sameDay = date.toDateString() === new Date().toDateString()
      return sameDay
        ? date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    },
    [language],
  )

  const [queue, setQueue] = useState<ReviewQueue>(initial)
  const [category, setCategory] = useState<StoryCategory | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(initialStoryId ?? initial.items[0]?.id ?? null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [rewriting, setRewriting] = useState<RewrittenLocale[]>([])
  const [suggestion, setSuggestion] = useState<{ kind: AssistKind; text: string } | null>(null)
  const [suggested, setSuggested] = useState<string[]>([])
  const [retried, setRetried] = useState<number[]>([])
  const [note, setNote] = useState<Note>({ text: t.notes.loaded(time(initial.loadedAt)), tone: 'muted' })
  const drafts = useRef(new Map<number, Edits>())

  // Only the editor for the selected story counts; while another loads, the panel shows "loading".
  const active = editor && editor.id === selectedId ? editor : null
  const detail = active?.detail ?? null
  const edits = active?.edits ?? null
  const baseline = active?.baseline ?? null
  const loading = selectedId !== null && active === null
  const dirty = edits !== null && baseline !== null && !sameEdits(edits, baseline)
  const setDetail = (loaded: ReviewDetail) => setEditor((current) => (current && current.id === loaded.id ? { ...current, detail: loaded } : current))
  const setEdits = (update: (current: Edits) => Edits) => setEditor((current) => (current ? { ...current, edits: update(current.edits) } : current))

  const errorText = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        const detail = error.detail
        const langs = Array.isArray(detail.locales) ? (detail.locales as RewrittenLocale[]).map((locale) => localeNames[locale]).join(t.join) : ''
        switch (error.code) {
          case 'title_too_long':
            return t.errors.title_too_long(Number(detail.max) || TITLE_MAX)
          case 'summary_too_long':
            return t.errors.summary_too_long(Number(detail.max) || SUMMARY_MAX)
          case 'rewrite_failed':
            return t.errors.rewrite_failed(langs)
          case 'bad_request':
            return `${t.errors.bad_request}${Array.isArray(detail.issues) ? ` (${detail.issues.join('; ')})` : ''}`
          case 'render_failed':
            return `${t.errors.render_failed}${detail.message ? `: ${detail.message}` : ''}`
          case 'not_found':
          case 'not_publishable':
          case 'not_published':
          case 'not_correctable':
          case 'duplicate_open':
          case 'no_reports':
          case 'bad_target':
          case 'poster_invalid':
          case 'poster_empty':
            return t.errors[error.code]
          default:
            return `${t.errors.failed}${detail.message ? `: ${detail.message}` : ''}`
        }
      }
      return `${t.errors.failed}: ${error instanceof Error ? error.message : String(error)}`
    },
    [t],
  )

  async function refreshQueue() {
    try {
      const fresh = await api.queue()
      setQueue(fresh)
      return fresh
    } catch (error) {
      toast.error(`${t.loadFailed}: ${errorText(error)}`)
      return null
    }
  }

  // Load the selected story; unsaved edits of a story the editor left come back with it.
  useEffect(() => {
    if (selectedId === null) return
    let cancelled = false
    api
      .detail(selectedId)
      .then((loaded) => {
        if (cancelled) return
        const base = editsOf(loaded)
        setEditor({ id: loaded.id, detail: loaded, edits: drafts.current.get(loaded.id) ?? base, baseline: base })
        setSuggestion(null)
        setSuggested([])
        setRewriting([])
      })
      .catch((error) => {
        if (!cancelled) toast.error(`${t.loadFailed}: ${errorText(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [api, selectedId, errorText, t])

  // Unsaved edits live in memory until an action sends them; warn before the tab closes.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || drafts.current.size) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function select(id: number | null) {
    if (detail && edits && dirty) drafts.current.set(detail.id, edits)
    else if (detail) drafts.current.delete(detail.id)
    setSelectedId(id)
  }

  const visible = queue.items.filter((item) => category === 'all' || item.category === category)
  const counts = Object.fromEntries(storyCategories.map((cat) => [cat, queue.items.filter((item) => item.category === cat).length])) as Record<
    StoryCategory,
    number
  >

  // --- the editor's derived state -------------------------------------------------------
  const published = detail?.status === 'published'
  const verb = published ? t.editor.verbSave : t.editor.verbPublish
  const hash = edits ? hansHash(edits) : ''
  const states = useMemo(() => {
    const base = detail ? localeStates(detail.localeStatus, hash) : ({ en: 'missing', ja: 'missing', ko: 'missing' } as Record<RewrittenLocale, LocaleState>)
    return base
  }, [detail, hash])
  const unverifiedTokens = useMemo(() => {
    if (!detail || !edits) return []
    const texts: Record<string, string | undefined> = { 'zh-Hans': [edits.title, edits.summary, edits.tryIt].join('\n') }
    for (const locale of rewrittenLocales) {
      const text = detail.texts[locale]
      texts[locale] = text ? [text.title, text.summary, text.tryIt].join('\n') : undefined
    }
    return stillMissing(detail.verification, texts)
  }, [detail, edits])
  const titleLength = textLength(edits?.title)
  const summaryLength = textLength(edits?.summary)
  const decision = primaryDecision({
    published,
    dirty,
    busy: busy === 'publish' || busy === 'correct' || busy === 'rewrite' || rewriting.length > 0,
    duplicateOpen: Boolean(detail?.duplicate),
    states,
    titleLength,
    summaryLength,
    unverified: unverifiedTokens.length,
  })
  const closed = detail?.status === 'merged' || detail?.status === 'rejected'

  const names = (locales: RewrittenLocale[]) => locales.map((locale) => localeNames[locale]).join(t.join)
  let hint = ''
  let hintTone: Tone = 'muted'
  let primaryLabel = published ? t.editor.save : t.editor.publish
  switch (decision.kind) {
    case 'busy':
      hint = published ? t.editor.hint.busySave : t.editor.hint.busyPublish
      hintTone = 'info'
      primaryLabel = published ? t.editor.saving : t.editor.publishing
      break
    case 'duplicate':
      hint = t.editor.hint.duplicate
      hintTone = 'bad'
      break
    case 'failed':
      hint = t.editor.hint.failed(names(decision.locales), verb)
      hintTone = 'bad'
      break
    case 'tooLong':
      hint = decision.field === 'title' ? t.editor.hint.titleLong(TITLE_MAX, verb) : t.editor.hint.summaryLong(SUMMARY_MAX, verb)
      hintTone = 'bad'
      break
    case 'clean':
      hint = t.editor.hint.clean
      break
    case 'rewrite':
      hint = t.editor.hint.rewrite(verb, names(decision.locales))
      hintTone = 'warn'
      primaryLabel = published ? t.editor.rewriteSave : t.editor.rewritePublish
      break
    case 'unverified':
      hint = t.editor.hint.unverified(decision.count)
      hintTone = 'warn'
      break
    case 'ready':
      hint = published ? t.editor.hint.readySave : t.editor.hint.readyPublish
      break
  }
  if (closed) {
    hint = detail?.status === 'merged' ? t.editor.hint.merged : t.editor.hint.rejected
    hintTone = 'muted'
  }

  // --- actions ----------------------------------------------------------------------------
  async function run<T>(kind: Exclude<Busy, null>, work: () => Promise<T>): Promise<T | null> {
    if (busy) return null
    setBusy(kind)
    try {
      return await work()
    } catch (error) {
      toast.error(errorText(error))
      if (detail && (kind === 'publish' || kind === 'correct' || kind === 'rewrite')) {
        // A failed language shows its reason on the story; reload it.
        api.detail(detail.id).then(setDetail).catch(() => undefined)
      }
      return null
    } finally {
      setBusy(null)
      setRewriting([])
    }
  }

  function applied(loaded: ReviewDetail) {
    drafts.current.delete(loaded.id)
    const base = editsOf(loaded)
    setEditor({ id: loaded.id, detail: loaded, edits: base, baseline: base })
  }

  async function moveOn(fromId: number) {
    drafts.current.delete(fromId)
    const fresh = await refreshQueue()
    const list = (fresh ?? queue).items.filter((item) => category === 'all' || item.category === category)
    const next = nextAfter(list, fromId) ?? nextAfter((fresh ?? queue).items, fromId)
    setSelectedId(next?.id ?? null)
    return fresh
  }

  const primary = () =>
    run(published ? 'correct' : 'publish', async () => {
      if (!detail || !edits) return
      if (decision.kind === 'rewrite') setRewriting(decision.locales)
      const title = clip(edits.title)
      if (published) {
        applied(await api.correct(detail.id, edits))
        setNote({ text: t.notes.corrected(title), tone: 'ok' })
        await refreshQueue()
      } else {
        await api.publish(detail.id, dirty ? edits : undefined)
        const fresh = await moveOn(detail.id)
        const joined = Boolean(fresh?.poster.items.some((item) => item.id === detail.id))
        setNote({ text: t.notes.published(title, joined), tone: 'ok' })
      }
    })

  const reject = () =>
    run('reject', async () => {
      if (!detail || !edits) return
      await api.reject(detail.id)
      setNote({ text: t.notes.rejected(clip(edits.title)), tone: 'muted' })
      await moveOn(detail.id)
    })

  const later = () =>
    run('later', async () => {
      if (!detail || !edits) return
      await api.later(detail.id, dirty ? edits : undefined)
      setNote({ text: t.notes.later(clip(edits.title)), tone: 'muted' })
      await moveOn(detail.id)
    })

  const withdraw = () =>
    run('withdraw', async () => {
      if (!detail || !edits) return
      applied(await api.withdraw(detail.id))
      setNote({ text: t.notes.withdrawn(clip(edits.title)), tone: 'warn' })
      await refreshQueue()
    })

  const merge = () =>
    run('merge', async () => {
      if (!detail?.duplicate || !edits) return
      const result = await api.merge(detail.id, detail.duplicate.id, dirty ? edits : undefined)
      setNote({ text: t.notes.merged(clip(result.target.title), result.target.moreReports), tone: 'ok' })
      await moveOn(detail.id)
    })

  const keep = () =>
    run('keep', async () => {
      if (!detail) return
      const loaded = await api.keepSeparate(detail.id)
      setDetail(loaded)
      setNote({ text: t.notes.kept, tone: 'muted' })
      await refreshQueue()
    })

  const rewrite = (locales: RewrittenLocale[]) =>
    run('rewrite', async () => {
      if (!detail || !edits) return
      setRewriting(locales)
      const loaded = await api.rewrite(detail.id, locales, dirty ? edits : undefined)
      applied(loaded)
      const after = localeStates(loaded.localeStatus, hansHash(loaded.hans))
      const failed = locales.filter((locale) => after[locale] === 'failed')
      if (failed.length) setNote({ text: t.notes.rewriteFailed(names(failed)), tone: 'bad' })
      else setNote({ text: t.notes.rewritten(names(locales)), tone: 'ok' })
      await refreshQueue()
    })

  const assist = (kind: AssistKind) =>
    run('assist', async () => {
      if (!detail || !edits) return
      const { text } = await api.assist(detail.id, kind, edits, suggested)
      setSuggestion({ kind, text })
      setSuggested((list) => [...list, text].slice(-5))
    })

  const retrySource = (sourceId: number) =>
    api
      .retrySource(sourceId)
      .then(() => setRetried((list) => [...list, sourceId]))
      .catch((error) => toast.error(errorText(error)))

  const setField = <K extends keyof Edits>(key: K, value: Edits[K]) => setEdits((current) => ({ ...current, [key]: value }))

  const showPoster = (poster: PosterDesk, generated: boolean) => {
    setQueue((current) => ({ ...current, poster }))
    if (generated) setNote({ text: t.poster.done, tone: 'ok' })
  }

  // --- summary cards ----------------------------------------------------------------------
  const { summary } = queue
  const failing = summary.sources.failing
  const cards = [
    {
      label: t.cards.pending,
      value: t.cards.count(summary.pending),
      dot: summary.pending ? 'busy' : 'ok',
      sub: summary.pending ? t.cards.pendingSub(summary.attention) : t.cards.queueEmpty,
    },
    {
      label: t.cards.published,
      value: t.cards.count(summary.publishedToday),
      dot: 'ok',
      sub: summary.publishedToday && summary.lastPublishedAt ? t.cards.publishedSub(time(summary.lastPublishedAt)) : t.cards.nonePublished,
    },
    {
      label: t.cards.sources,
      value: t.cards.sourcesOk(summary.sources.total - failing.length, summary.sources.total),
      dot: failing.length ? 'bad' : 'ok',
      sub: failing.length ? t.cards.sourcesSub(failing.map((source) => source.name).join(t.join)) : t.cards.sourcesFine,
      fix: failing.length ? failing : undefined,
    },
    {
      label: t.cards.usage,
      value: t.cards.usageValue(summary.usage.costUsd, summary.usage.budgetUsd),
      dot: summary.switches.modelCalls ? 'ok' : 'bad',
      sub: t.cards.usageSub(summary.usage.calls, summary.switches.collect, summary.switches.modelCalls),
    },
  ]

  const sitePrefix = language.startsWith('zh') ? '/zh-hans' : '/en'

  return (
    <div className="daily-review">
      <header className="daily-review__header">
        <div>
          <h1 style={{ display: 'inline' }}>{t.title}</h1>
          <span className="daily-review__sub">{t.subtitle}</span>
        </div>
        <div className="daily-review__header-actions">
          <Button buttonStyle="secondary" el="link" size="small" to={`${adminRoute}/collections/stories`}>
            {t.allStories}
          </Button>
          <Button buttonStyle="secondary" el="anchor" newTab size="small" url={`${sitePrefix}/daily`}>
            {t.openSite}
          </Button>
          <Button buttonStyle="secondary" size="small" onClick={() => refreshQueue().then((fresh) => fresh && setNote({ text: t.notes.loaded(time(fresh.loadedAt)), tone: 'muted' }))}>
            {t.refresh}
          </Button>
        </div>
      </header>
      <p className="daily-review__meta">{t.metaLine}</p>
      <p aria-live="polite" className={`daily-review__note daily-review__note--${note.tone}`}>
        {note.text}
      </p>

      <section className="daily-review__cards">
        {cards.map((card) => (
          <div className={`daily-review__card${card.dot === 'bad' ? ' daily-review__card--bad' : ''}`} key={card.label}>
            <div className="daily-review__card-label">
              <span className={`daily-review__dot daily-review__dot--${card.dot}`} />
              {card.label}
            </div>
            <p className="daily-review__card-value">{card.value}</p>
            <div className="daily-review__card-sub">
              <span>{card.sub}</span>
              {card.fix?.map((source) => (
                <Button
                  buttonStyle="pill"
                  disabled={retried.includes(source.id)}
                  key={source.id}
                  onClick={() => retrySource(source.id)}
                  size="xsmall"
                >
                  {retried.includes(source.id) ? t.cards.retrying : `${t.cards.retry} · ${source.name}`}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="daily-review__columns">
        <aside className="daily-review__queue">
          <div className="daily-review__queue-head">
            <h2>
              {t.queue.heading}
              <span className="daily-review__count">{queue.items.length}</span>
            </h2>
            <span className="daily-review__small">{t.queue.byHeat}</span>
          </div>
          <p className="daily-review__small">{t.queue.intake(summary.intake.items, summary.intake.events, summary.intake.queued)}</p>
          <div className="daily-review__chips" role="group">
            {(['all', ...storyCategories] as const).map((cat) => (
              <button
                aria-pressed={category === cat}
                className="daily-review__chip"
                key={cat}
                onClick={() => setCategory(cat)}
                type="button"
              >
                {cat === 'all' ? t.queue.all : t.categories[cat]} {cat === 'all' ? queue.items.length : counts[cat]}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="daily-review__empty">{queue.items.length ? t.queue.emptyCategory(category === 'all' ? t.queue.all : t.categories[category]) : t.queue.emptyAll}</p>
          ) : (
            <ul className="daily-review__list">
              {visible.map((item) => {
                const on = item.id === selectedId
                const flags = flagsOfItem(item)
                const score = item.score == null ? null : Math.round(item.score)
                return (
                  <li aria-current={on} className="daily-review__item" key={item.id} onClick={() => select(item.id)}>
                    <div className="daily-review__item-top">
                      <Pill pillStyle="light" size="small">
                        {t.categories[item.category]}
                      </Pill>
                      <span>
                        {item.sourceName}
                        {item.originalPublishedAt ? ` · ${time(item.originalPublishedAt)}` : ''}
                      </span>
                    </div>
                    <p className="daily-review__item-title">{item.title}</p>
                    {flags.length > 0 && (
                      <div className="daily-review__flags">
                        {flags.map((flag) => (
                          <Pill key={flag.kind} pillStyle={flagStyle[flag.kind]} size="small">
                            {flagText(flag, t)}
                          </Pill>
                        ))}
                      </div>
                    )}
                    <div className="daily-review__item-bottom">
                      <span className="daily-review__score">
                        {t.queue.score} {score ?? '—'}
                        <span className={`daily-review__bar${score != null && score >= 85 ? ' daily-review__bar--high' : ''}`}>
                          <i style={{ width: `${score ?? 0}%` }} />
                        </span>
                      </span>
                      <Button
                        buttonStyle={on ? 'primary' : 'secondary'}
                        onClick={(event) => {
                          event.stopPropagation()
                          select(item.id)
                        }}
                        size="small"
                      >
                        {on ? t.queue.reviewing : t.queue.review}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <main className="daily-review__editor">
          {!detail || !edits ? (
            <p className="daily-review__placeholder">{loading ? t.loading : t.editor.pickOne}</p>
          ) : (
            <>
              <div className="daily-review__editor-head">
                <h2>{published ? t.editor.correct : t.editor.review}</h2>
                <Pill pillStyle={published ? 'success' : detail.laterAt || detail.status === 'withdrawn' ? 'warning' : 'light-gray'} size="small">
                  {published
                    ? t.editor.published(time(detail.publishedAt))
                    : detail.status === 'withdrawn'
                      ? t.editor.withdrawn
                      : detail.laterAt
                        ? t.editor.later
                        : detail.status === 'pending'
                          ? t.editor.pending
                          : detail.status}
                </Pill>
                {dirty && <span className="daily-review__small">{t.editor.unsaved}</span>}
                <span className="daily-review__spacer" />
                {detail.original && (
                  <a href={detail.original.url} rel="noreferrer" target="_blank">
                    {t.editor.original}
                  </a>
                )}
                <a href={`${adminRoute}/collections/stories/${detail.id}`}>{t.editor.moreFields}</a>
              </div>
              <p className="daily-review__editor-meta">
                {t.editor.score(detail.score)}
                {detail.scoreA != null && detail.scoreB != null ? t.editor.scoreBoth(detail.scoreA, detail.scoreB) : ''}
                {detail.original?.publishedAt ? ` · ${t.editor.originalAt(time(detail.original.publishedAt))}` : ''}
                {detail.original ? ` · ${t.editor.reports(detail.original.name, detail.moreReports)}` : ''}
              </p>

              {detail.verification && (
                <div className={`daily-review__check${unverifiedTokens.length ? ' daily-review__check--warn' : ''}`}>
                  {unverifiedTokens.length
                    ? `! ${t.editor.checkMissing(unverifiedTokens.map((item) => `「${item.token}」(${item.locale})`).join(t.join))}`
                    : detail.verification.checked
                      ? `✓ ${t.editor.checkOk('')}`
                      : `✓ ${t.editor.checkNone}`}
                </div>
              )}

              {detail.duplicate && !closed && (
                <div className="daily-review__dup">
                  <p>
                    {t.editor.dup(
                      time(detail.duplicate.publishedAt),
                      clip(detail.duplicate.title, 30),
                      detail.duplicate.similarity != null ? `（${Math.round(detail.duplicate.similarity * 100)}%）` : '',
                    )}
                    {detail.duplicate.reason === 'same_event' ? ` ${t.editor.dupSameEvent}` : ''}
                  </p>
                  <div className="daily-review__row">
                    <Button buttonStyle="primary" disabled={busy !== null} onClick={merge} size="small">
                      {t.editor.merge}
                    </Button>
                    <Button buttonStyle="secondary" disabled={busy !== null} onClick={keep} size="small">
                      {t.editor.keep}
                    </Button>
                    <a href={`${adminRoute}/collections/stories/review?story=${detail.duplicate.id}`}>{detail.duplicate.title}</a>
                  </div>
                </div>
              )}

              <div className="daily-review__actions">
                <p className={`daily-review__hint daily-review__hint--${hintTone}`}>{hint}</p>
                {!closed && (
                  <div className="daily-review__buttons">
                    <Button buttonStyle="secondary" disabled={busy !== null} onClick={published ? withdraw : reject} size="medium">
                      {published ? t.editor.withdraw : t.editor.reject}
                    </Button>
                    {!published && (
                      <Button buttonStyle="secondary" disabled={busy !== null} onClick={later} size="medium">
                        {t.editor.setAside}
                      </Button>
                    )}
                    <span className="daily-review__spacer" />
                    <Button buttonStyle="primary" disabled={busy !== null || !primaryEnabled(decision)} onClick={primary} size="medium">
                      {primaryLabel}
                    </Button>
                  </div>
                )}
              </div>

              <div className="daily-review__field">
                <label className="daily-review__label" htmlFor="daily-review-title">
                  <span>{t.editor.titleLabel}</span>
                  <small className={titleLength > TITLE_MAX ? 'is-over' : undefined}>{t.editor.chars(titleLength, TITLE_MAX)}</small>
                </label>
                <input className="daily-review__input" id="daily-review-title" lang="zh-Hans" onChange={(event) => setField('title', event.target.value)} type="text" value={edits.title} />
              </div>
              <div className="daily-review__field">
                <label className="daily-review__label" htmlFor="daily-review-summary">
                  <span>{t.editor.summaryLabel}</span>
                  <small className={summaryLength > SUMMARY_MAX ? 'is-over' : undefined}>{t.editor.chars(summaryLength, SUMMARY_MAX)}</small>
                </label>
                <textarea className="daily-review__input" id="daily-review-summary" lang="zh-Hans" onChange={(event) => setField('summary', event.target.value)} value={edits.summary} />
              </div>
              <div className="daily-review__field">
                <label className="daily-review__label" htmlFor="daily-review-tryit">
                  <span>
                    {t.editor.tryItLabel} <small>{t.editor.tryItNote}</small>
                  </span>
                </label>
                <textarea className="daily-review__input" id="daily-review-tryit" lang="zh-Hans" onChange={(event) => setField('tryIt', event.target.value)} rows={2} value={edits.tryIt} />
              </div>
              <div className="daily-review__field">
                <div className="daily-review__label">
                  <span>{t.editor.category}</span>
                </div>
                <div className="daily-review__chips" role="group">
                  {storyCategories.map((cat) => (
                    <button aria-pressed={edits.category === cat} className="daily-review__chip" key={cat} onClick={() => setField('category', cat)} type="button">
                      {t.categories[cat]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="daily-review__field">
                <div className="daily-review__label">
                  <span>
                    {t.editor.sources} <small>{t.editor.sourcesNote}</small>
                  </span>
                </div>
                <div className="daily-review__sources">
                  {edits.sources.map((source, index) => (
                    <div className="daily-review__source" key={index}>
                      <input
                        aria-label={t.editor.sourceName}
                        className="daily-review__input"
                        onChange={(event) => setField('sources', edits.sources.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))}
                        placeholder={t.editor.sourceName}
                        type="text"
                        value={source.name}
                      />
                      <select
                        className="daily-review__input"
                        onChange={(event) =>
                          setField('sources', edits.sources.map((row, i) => (i === index ? { ...row, role: event.target.value as typeof row.role } : row)))
                        }
                        value={source.role}
                      >
                        {(['original', 'report', 'discussion'] as const).map((role) => (
                          <option key={role} value={role}>
                            {t.editor.roles[role]}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={t.editor.sourceUrl}
                        className="daily-review__input"
                        onChange={(event) => setField('sources', edits.sources.map((row, i) => (i === index ? { ...row, url: event.target.value } : row)))}
                        placeholder="https://"
                        type="url"
                        value={source.url}
                      />
                      <Button buttonStyle="secondary" onClick={() => setField('sources', edits.sources.filter((_, i) => i !== index))} size="small">
                        {t.editor.removeSource}
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button
                      buttonStyle="secondary"
                      onClick={() => setField('sources', [...edits.sources, { name: '', role: 'report', url: '', publishedAt: null }])}
                      size="small"
                    >
                      {t.editor.addSource}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="daily-review__section">
                <div className="daily-review__section-head">
                  <h3>{t.editor.assist}</h3>
                  <div className="daily-review__row">
                    <Button buttonStyle="secondary" disabled={busy !== null} onClick={() => assist('shorten')} size="small">
                      {busy === 'assist' ? t.editor.thinking : t.editor.shorten}
                    </Button>
                    <Button buttonStyle="secondary" disabled={busy !== null} onClick={() => assist('title')} size="small">
                      {busy === 'assist' ? t.editor.thinking : t.editor.altTitle}
                    </Button>
                  </div>
                </div>
                {suggestion && (
                  <div className="daily-review__suggestion">
                    <p className="daily-review__small">{t.editor.suggestion(suggestion.kind, textLength(suggestion.text), verb)}</p>
                    <p lang="zh-Hans">{suggestion.text}</p>
                    <div className="daily-review__row">
                      <Button
                        buttonStyle="primary"
                        onClick={() => {
                          setField(suggestion.kind === 'shorten' ? 'summary' : 'title', suggestion.text)
                          setSuggestion(null)
                        }}
                        size="small"
                      >
                        {t.editor.adopt}
                      </Button>
                      <Button buttonStyle="secondary" onClick={() => setSuggestion(null)} size="small">
                        {t.editor.dismiss}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="daily-review__section">
                <div className="daily-review__section-head">
                  <h3>
                    {t.editor.languages} <small className="daily-review__small">{t.editor.languagesNote}</small>
                  </h3>
                  {localesToRewrite(states).length > 1 && !closed && (
                    <Button buttonStyle="secondary" disabled={busy !== null} onClick={() => rewrite(localesToRewrite(states))} size="small">
                      {t.editor.rewriteAll}
                    </Button>
                  )}
                </div>
                <ul className="daily-review__langs">
                  {rewrittenLocales.map((locale) => {
                    const running = rewriting.includes(locale)
                    const state = states[locale]
                    const entry = detail.localeStatus[locale]
                    const [status, tone] = running
                      ? [t.editor.state.running, 'info']
                      : state === 'written'
                        ? [t.editor.state.written, 'ok']
                        : state === 'stale'
                          ? [t.editor.state.stale(verb), 'warn']
                          : state === 'failed'
                            ? [t.editor.state.failed(entry?.error ?? ''), 'bad']
                            : [t.editor.state.missing, 'muted']
                    const preview = state === 'written' ? detail.texts[locale]?.title : undefined
                    return (
                      <li className={`daily-review__lang${state === 'failed' && !running ? ' daily-review__lang--failed' : ''}`} key={locale}>
                        <span className="daily-review__lang-name" lang={locale}>
                          {localeNames[locale]}
                        </span>
                        <span>
                          <span className={`daily-review__lang-status daily-review__lang-status--${tone}`}>{status}</span>
                          {preview && (
                            <span className="daily-review__preview" lang={locale} title={preview}>
                              {preview}
                            </span>
                          )}
                        </span>
                        {!running && !closed && state !== 'written' && (
                          <Button buttonStyle="secondary" disabled={busy !== null} onClick={() => rewrite([locale])} size="small">
                            {state === 'failed' ? t.editor.retry : t.editor.rewriteNow}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                  <li className="daily-review__lang">
                    <span className="daily-review__lang-name" lang="zh-Hant">
                      {t.editor.hant}
                    </span>
                    <span>
                      <span className="daily-review__lang-status daily-review__lang-status--muted">{t.editor.hantNote}</span>
                      {detail.texts['zh-Hant']?.title && (
                        <span className="daily-review__preview" lang="zh-Hant" title={detail.texts['zh-Hant'].title}>
                          {detail.texts['zh-Hant'].title}
                        </span>
                      )}
                    </span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </main>

        <PosterColumn
          api={api}
          desk={queue.poster}
          errorText={errorText}
          onDesk={showPoster}
          onSelect={select}
          selectedId={selectedId}
          sitePrefix={sitePrefix}
          t={t}
          time={time}
        />
      </div>
    </div>
  )
}
