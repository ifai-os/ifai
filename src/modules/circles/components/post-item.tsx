'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { Link } from '@/i18n/navigation'

import { linkify, reactionEmoji, reactions, type PostView, type Reaction, type ReactionView } from '../rules'
import { useCircles } from './circles-provider'
import { PersonAvatar } from './person-avatar'

const dayMs = 24 * 60 * 60 * 1000

/** One post: who and when, in which circle, the text, the reactions, and「更多」(delete one's own, report the others). */
export function PostItem({ post, reported, onReport }: { post: PostView; reported: boolean; onReport: () => void }) {
  const t = useTranslations('circles')
  const { byId } = useCircles()
  const circle = byId.get(post.circle)
  const name = post.author.name || t('anonymous')

  return (
    <li className="flex flex-col gap-3 border-b border-hairline py-5">
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={name} tone={post.author.tone} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-ui font-medium wrap-anywhere">{post.mine ? t('youNamed', { name }) : name}</span>
          <span className="text-small text-ink-4">
            <PostTime iso={post.createdAt} />
            {circle && (
              <>
                <span aria-hidden="true"> · </span>
                {t.rich('postedIn', {
                  name: circle.name,
                  circle: (chunks) => (
                    <Link href={{ pathname: '/circles', query: { circle: circle.slug } }} scroll={false} className="text-ink-2 hover:text-ink hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </>
            )}
          </span>
        </div>
        <MoreMenu post={post} name={name} reported={reported} onReport={onReport} />
      </div>
      {post.hidden && <p className="rounded-thumb bg-warn px-3 py-2 text-meta text-warn-ink">{t('hiddenNote')}</p>}
      <p lang={post.lang} className="text-body whitespace-pre-line wrap-anywhere">
        {linkify(post.body).map((part, index) =>
          'href' in part ? (
            <a key={index} href={part.href} target="_blank" rel="nofollow ugc noopener noreferrer" className="text-link hover:underline">
              {part.text}
            </a>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
      {!post.hidden && <ReactionBar post={post} />}
    </li>
  )
}

/** 3 小时前 within a day of loading, the date after that; the exact time on hover. */
function PostTime({ iso }: { iso: string }) {
  const format = useFormatter()
  const { loadedAt } = useCircles()
  const date = new Date(iso)
  const now = Math.max(loadedAt, date.getTime())
  if (now - date.getTime() >= dayMs) return <LocalTime iso={iso} style="date" />
  return <time dateTime={iso}>{format.relativeTime(date, now)}</time>
}

/** The reactions, most people first, and the picker with all six. */
function ReactionBar({ post }: { post: PostView }) {
  const t = useTranslations('circles')
  const { react } = useCircles()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pickerId = useId()

  // Closes on a press outside or Escape, like a menu.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const mine = new Set(post.reactions.filter((item) => item.mine).map((item) => item.reaction))
  const pick = (reaction: Reaction) => {
    react(post, reaction, !mine.has(reaction))
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {post.reactions.map((item) => (
        <ReactionChip key={item.reaction} item={item} onToggle={() => react(post, item.reaction, !item.mine)} />
      ))}
      <div
        ref={box}
        className="relative flex"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={pickerId}
          aria-label={t('addReaction')}
          title={t('addReaction')}
          className="flex size-8 items-center justify-center rounded-pill bg-surface-2 text-ink-2 hover:text-ink"
        >
          <Icon name="reaction" size={18} />
        </button>
        {open && (
          <div
            id={pickerId}
            role="group"
            aria-label={t('reactionsGroup')}
            className="absolute bottom-10 left-0 z-10 flex items-center gap-0.5 rounded-card border border-hairline bg-overlay px-2 py-1.5 whitespace-nowrap shadow-float"
          >
            {reactions.map((reaction) => (
              <button
                key={reaction}
                type="button"
                onClick={() => pick(reaction)}
                aria-pressed={mine.has(reaction)}
                aria-label={t(`reactionNames.${reaction}`)}
                title={t(`reactionNames.${reaction}`)}
                className={`flex size-10 items-center justify-center rounded-tile text-[22px] leading-none hover:bg-surface ${mine.has(reaction) ? 'bg-accent-soft' : ''}`}
              >
                <span aria-hidden="true">{reactionEmoji[reaction]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 👍 48: theirs is outlined in red. Hovering names who reacted:「你、林栖等 12 人：赞」. */
function ReactionChip({ item, onToggle }: { item: ReactionView; onToggle: () => void }) {
  const t = useTranslations('circles')
  const format = useFormatter()
  const label = t(`reactionNames.${item.reaction}`)
  const names = [...(item.mine ? [t('you')] : []), ...item.names.map((name) => name || t('anonymous'))]
  const named = Math.min(names.length, item.count)
  const who = t('reactedBy', { names: names.slice(0, named).join(t('listSeparator')), others: item.count - named, label })
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={item.mine}
      aria-label={t('reactionLabel', { label, count: item.count, mine: item.mine ? 'yes' : 'no' })}
      title={who}
      className={`flex h-8 items-center gap-1.5 rounded-pill border px-2.5 text-meta font-medium ${
        item.mine ? 'border-accent bg-accent-soft text-tile-7-ink' : 'border-transparent bg-surface-2 text-ink-2 hover:border-line'
      }`}
    >
      <span aria-hidden="true" className="text-[16px] leading-none">
        {reactionEmoji[item.reaction]}
      </span>
      {format.number(item.count)}
    </button>
  )
}

/** 「更多」: delete one's own post (asked twice), or report someone else's. */
function MoreMenu({ post, name, reported, onReport }: { post: PostView; name: string; reported: boolean; onReport: () => void }) {
  const t = useTranslations('circles')
  const { remove } = useCircles()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  async function confirmDelete() {
    setBusy(true)
    setFailed(false)
    const ok = await remove(post.id)
    setBusy(false)
    if (!ok) setFailed(true)
  }

  const item = 'flex min-h-10 w-full items-center rounded-thumb px-3 text-left text-ui hover:bg-surface disabled:opacity-60'
  return (
    <div
      ref={box}
      className="relative flex-none"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          setConfirming(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen(!open)
          setConfirming(false)
        }}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('moreName', { name })}
        className="flex size-9 items-center justify-center rounded-pill text-ink-4 hover:bg-surface hover:text-ink"
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div id={menuId} className="absolute top-10 right-0 z-10 flex w-max min-w-36 flex-col rounded-tile border border-hairline bg-overlay p-1 shadow-float">
          {post.mine ? (
            confirming ? (
              <div role="group" aria-label={t('deleteConfirm')} className="flex flex-col gap-1 p-2">
                <span className="text-meta text-ink-2">{t('deleteConfirm')}</span>
                <div className="flex gap-3">
                  <button type="button" onClick={confirmDelete} disabled={busy} className="h-8 text-meta font-medium text-down hover:underline disabled:opacity-60">
                    {t('deleteYes')}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-8 text-meta text-link hover:underline disabled:opacity-60">
                    {t('cancel')}
                  </button>
                </div>
                {failed && (
                  <span role="alert" className="text-small text-down">
                    {t('errors.failed')}
                  </span>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={item}>
                {t('delete')}
              </button>
            )
          ) : (
            <button
              type="button"
              disabled={reported}
              onClick={() => {
                setOpen(false)
                onReport()
              }}
              className={item}
            >
              {reported ? t('reported') : t('report')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
