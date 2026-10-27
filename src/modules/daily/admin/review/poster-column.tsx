'use client'

import { Button, Pill, toast } from '@payloadcms/ui'
import { useState } from 'react'

import { POSTER_MAX } from '../../poster/rules'
import type { PosterDesk } from '../../poster/types'
import type { ReviewApi } from './api'
import type { ReviewText } from './text'

type Props = {
  desk: PosterDesk
  api: ReviewApi
  t: ReviewText
  selectedId: number | null
  onSelect: (id: number) => void
  /** The column changed on the server: show this poster. */
  onDesk: (desk: PosterDesk, generated: boolean) => void
  errorText: (error: unknown) => string
  time: (iso: string | null | undefined) => string
  /** Where the site's simplified Chinese pages are, for the preview link. */
  sitePrefix: string
}

const icons = {
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  remove: 'M6 6l12 12M18 6 6 18',
}

function Icon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
      <path d={path} />
    </svg>
  )
}

/**
 * 「今日海报」, the right column of the「IFAI 日报审核后台」board: today's poster (Shanghai day)
 * in order, with moving, removing and adding the day's other published stories; generating
 * the five images; every title opens the story in the middle for corrections.
 */
export function PosterColumn({ desk, api, t, selectedId, onSelect, onDesk, errorText, time, sitePrefix }: Props) {
  const [pending, setPending] = useState<'arrange' | 'generate' | null>(null)
  const ids = desk.items.map((item) => item.id)
  const n = ids.length
  const [, month, day] = desk.date.split('-').map(Number)

  async function arrange(items: number[]) {
    if (pending) return
    setPending('arrange')
    try {
      onDesk(await api.arrangePoster(desk.date, items), false)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setPending(null)
    }
  }

  async function generate() {
    if (pending || !n) return
    setPending('generate')
    try {
      onDesk(await api.generatePoster(desk.date), true)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setPending(null)
    }
  }

  const move = (index: number, by: number) => {
    const items = [...ids]
    ;[items[index], items[index + by]] = [items[index + by], items[index]]
    return arrange(items)
  }

  const generated = desk.state === 'generated' || desk.state === 'stale'
  const [label, note, tone] =
    pending === 'generate'
      ? [t.poster.generating, t.poster.state.generating, 'info']
      : desk.state === 'empty'
        ? [t.poster.generateEmpty, t.poster.state.empty, 'muted']
        : desk.state === 'generated'
          ? [t.poster.regenerate, t.poster.state.generated(time(desk.generatedAt)), 'ok']
          : desk.state === 'stale'
            ? [t.poster.regenerate, t.poster.state.stale, 'warn']
            : [t.poster.generate, t.poster.state.idle, 'muted']

  return (
    <section aria-labelledby="daily-poster-heading" className="daily-review__poster">
      <div className="daily-review__poster-head">
        <div className="daily-review__poster-title">
          <h2 id="daily-poster-heading">
            {t.poster.heading}
            <span className="daily-review__count">{n}</span>
            <span className="daily-review__small"> {t.poster.limit}</span>
          </h2>
          <span className="daily-review__small">{t.poster.day(month, day)}</span>
        </div>
        <p className="daily-review__small">{desk.arranged ? t.poster.arranged : t.poster.auto}</p>
      </div>

      {n === 0 ? (
        <p className="daily-review__poster-empty">{desk.others.length ? t.poster.emptyAdd : t.poster.emptyNone}</p>
      ) : (
        <ol className="daily-review__poster-list">
          {desk.items.map((item, index) => (
            <li key={item.id}>
              <div aria-current={item.id === selectedId} className="daily-review__poster-row">
                <span className={`daily-review__poster-no${index === 0 ? ' daily-review__poster-no--head' : ''}`}>{index + 1}</span>
                <button className="daily-review__poster-pick" onClick={() => onSelect(item.id)} type="button">
                  <span className="daily-review__poster-story" lang="zh-Hans">
                    {item.title}
                  </span>
                  <span className="daily-review__poster-meta">
                    <Pill pillStyle="light" size="small">
                      {t.categories[item.category]}
                    </Pill>
                    <span>{[item.source, time(item.publishedAt)].filter(Boolean).join(' · ')}</span>
                    {item.fresh && (
                      <Pill pillStyle="success" size="small">
                        {t.poster.fresh}
                      </Pill>
                    )}
                  </span>
                </button>
                <span className="daily-review__poster-tools">
                  <button aria-label={t.poster.up(index + 1)} disabled={index === 0 || pending !== null} onClick={() => move(index, -1)} type="button">
                    <Icon path={icons.up} />
                  </button>
                  <button aria-label={t.poster.down(index + 1)} disabled={index === n - 1 || pending !== null} onClick={() => move(index, 1)} type="button">
                    <Icon path={icons.down} />
                  </button>
                  <button aria-label={t.poster.remove(index + 1)} disabled={pending !== null} onClick={() => arrange(ids.filter((id) => id !== item.id))} type="button">
                    <Icon path={icons.remove} />
                  </button>
                </span>
              </div>
              {index === 0 && n > 1 && <p className="daily-review__poster-divider">{t.poster.headNote}</p>}
            </li>
          ))}
        </ol>
      )}

      {desk.others.length > 0 && (
        <div className="daily-review__poster-others">
          <span className="daily-review__small">{t.poster.others(desk.others.length)}</span>
          <ul>
            {desk.others.map((other) => {
              const ok = other.check === 'ok' && n < POSTER_MAX
              return (
                <li key={other.id}>
                  <button aria-current={other.id === selectedId} className="daily-review__poster-other" lang="zh-Hans" onClick={() => onSelect(other.id)} type="button">
                    {other.title}
                  </button>
                  <button
                    aria-label={other.check === 'ok' ? t.poster.addLabel(other.title) : t.poster.whyLabel[other.check]}
                    className="daily-review__poster-add"
                    disabled={!ok || pending !== null}
                    onClick={() => arrange([...ids, other.id])}
                    type="button"
                  >
                    {other.check === 'ok' ? t.poster.add : t.poster.why[other.check]}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="daily-review__poster-foot">
        <Button
          buttonStyle={desk.state === 'generated' ? 'secondary' : 'primary'}
          disabled={pending !== null || n === 0}
          onClick={generate}
          size="medium"
        >
          {label}
        </Button>
        <p className={`daily-review__hint daily-review__hint--${tone}`} role="status">
          {note}
        </p>
        {generated && (
          <a href={`${sitePrefix}/news/poster/${desk.date}`} rel="noreferrer" target="_blank">
            {t.poster.preview}
          </a>
        )}
      </div>
    </section>
  )
}
