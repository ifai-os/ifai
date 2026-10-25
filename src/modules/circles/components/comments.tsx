'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { buttonClass } from '@/components/button'
import { toneFor } from '@/components/cards/initial-tile'
import { LoadFailed } from '@/components/states/load-failed'
import { Skeleton } from '@/components/states/skeleton'
import { skeletonDelayMs } from '@/components/states/timing'
import { cleanText, textLength } from '@/modules/apps/reviews/rules'
import { ProfileLink } from '@/modules/profiles/components/profile-link'

import { commentRules, type CirclesError, type CommentChange, type CommentsPage, type CommentThread, type CommentView, type RepliesPage } from '../rules'
import { json, request, useCirclesSession } from './circles-session'
import { MoreMenu } from './more-menu'
import { PersonAvatar } from './person-avatar'
import { LinkedText, PostTime } from './post-item'

type Loading = 'idle' | 'loading' | 'failed'

/** A comment on the post with the replies read so far. */
type Thread = CommentThread & {
  /** Where reading the rest of its replies starts: the last one the server sent. */
  cursor: number | null
  more: Loading
}

const toThread = (thread: CommentThread): Thread => ({ ...thread, cursor: thread.replies.at(-1)?.id ?? null, more: 'idle' })

/** The reply box that is open, under the comment or reply it answers; `opener` gets the focus back when it closes. */
type Replying = { to: CommentView; opener: HTMLElement | null }

type CommentsProps = {
  postId: number
  /** The first page from the server; without it the page reads it. */
  initial: CommentsPage | null
  /** Comments and replies everyone can see, for「评论 N」here and on the post. */
  count: number
  onCount: (count: number) => void
  isReported: (commentId: number) => boolean
  onReport: (commentId: number) => void
}

/**
 * 「评论 N」under a post (docs/specs/circles.md rule 15): the box to write one, then the comments,
 * newest first, each with its replies oldest first (the first three, the rest on request).
 * Visitors read them; writing or replying asks them to sign in first.
 */
export function Comments({ postId, initial, count, onCount, isReported, onReport }: CommentsProps) {
  const t = useTranslations('circles')
  const { signedIn, sessionPending, askToSignIn } = useCirclesSession()
  const [status, setStatus] = useState<'loading' | 'failed' | 'ready'>(initial ? 'ready' : 'loading')
  const [threads, setThreads] = useState<Thread[]>(() => (initial?.comments ?? []).map(toThread))
  const [next, setNext] = useState(initial?.next ?? null)
  const [more, setMore] = useState<Loading>('idle')
  const [replying, setReplying] = useState<Replying | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const readFirst = useCallback(
    () =>
      request<CommentsPage>(`/api/circles/comments?post=${postId}`).then(({ data }) => {
        if (!data) return setStatus('failed')
        setThreads(data.comments.map(toThread))
        setNext(data.next)
        onCount(data.count)
        setStatus('ready')
      }),
    [postId, onCount],
  )

  // The server could not read them for the page: read them here.
  useEffect(() => {
    if (!initial) void readFirst()
  }, [initial, readFirst])

  const updateThread = (id: number, change: (thread: Thread) => Thread) =>
    setThreads((current) => current.map((thread) => (thread.id === id ? change(thread) : thread)))

  async function loadMore() {
    if (next === null) return
    setMore('loading')
    const { data } = await request<CommentsPage>(`/api/circles/comments?post=${postId}&cursor=${next}`)
    if (!data) return setMore('failed')
    setThreads((current) => {
      const known = new Set(current.map((thread) => thread.id))
      return [...current, ...data.comments.filter((thread) => !known.has(thread.id)).map(toThread)]
    })
    setNext(data.next)
    onCount(data.count)
    setMore('idle')
  }

  async function loadReplies(thread: Thread) {
    updateThread(thread.id, (item) => ({ ...item, more: 'loading' }))
    const query = new URLSearchParams({ post: String(postId), thread: String(thread.id) })
    if (thread.cursor) query.set('cursor', String(thread.cursor))
    const { data } = await request<RepliesPage>(`/api/circles/comments?${query}`)
    if (!data) return updateThread(thread.id, (item) => ({ ...item, more: 'failed' }))
    updateThread(thread.id, (item) => {
      // Replies the reader wrote here are on the page already.
      const known = new Set(item.replies.map((reply) => reply.id))
      const replies = [...item.replies, ...data.replies.filter((reply) => !known.has(reply.id))].sort((a, b) => a.id - b.id)
      return {
        ...item,
        replies,
        cursor: data.next ?? data.replies.at(-1)?.id ?? item.cursor,
        replyCount: data.next === null ? replies.length : Math.max(item.replyCount, replies.length),
        more: 'idle',
      }
    })
  }

  function added({ comment, count: total }: CommentChange) {
    onCount(total)
    if (comment.parent === null) setThreads((current) => [{ ...comment, replies: [], replyCount: 0, cursor: null, more: 'idle' }, ...current])
    else updateThread(comment.parent, (thread) => ({ ...thread, replies: [...thread.replies, comment], replyCount: thread.replyCount + 1 }))
  }

  async function remove(comment: CommentView): Promise<boolean> {
    const { data } = await request<{ count: number }>(`/api/circles/comments?id=${comment.id}`, { method: 'DELETE' })
    if (!data) return false
    onCount(data.count)
    if (comment.parent === null) setThreads((current) => current.filter((thread) => thread.id !== comment.id))
    else
      updateThread(comment.parent, (thread) => ({
        ...thread,
        replies: thread.replies.filter((reply) => reply.id !== comment.id),
        replyCount: Math.max(thread.replyCount - 1, 0),
      }))
    if (replying && (replying.to.id === comment.id || replying.to.parent === comment.id)) setReplying(null)
    // The menu went with the comment: the focus goes to the heading rather than the page's top.
    heading.current?.focus()
    return true
  }

  function reply(to: CommentView, opener: HTMLElement) {
    if (sessionPending) return
    if (!signedIn) return askToSignIn('comment')
    setReplying({ to, opener })
  }

  function closeReply() {
    replying?.opener?.focus()
    setReplying(null)
  }

  // Under a hidden comment, which only its author still sees, nothing can be answered or reported.
  const item = (comment: CommentView, thread: Thread) => (
    <CommentItem
      comment={comment}
      open={!comment.hidden && !thread.hidden}
      replyCount={comment.parent === null ? thread.replyCount : 0}
      reported={isReported(comment.id)}
      onReport={() => onReport(comment.id)}
      onReply={(opener) => reply(comment, opener)}
      onDelete={() => remove(comment)}
    />
  )

  const replyBox = (to: CommentView) =>
    replying?.to.id === to.id && (
      <div className={`pt-3 ${to.parent === null ? 'pl-13' : 'pl-12'}`}>
        <CommentForm postId={postId} replyTo={to} onAdded={added} onClose={closeReply} />
      </div>
    )

  return (
    <section id="comments" aria-labelledby="comments-title" className="flex-1 scroll-mt-16 bg-surface px-4 pt-10 pb-24">
      <div className="mx-auto flex w-full max-w-read flex-col gap-5">
        <h2 id="comments-title" ref={heading} tabIndex={-1} className="text-h3 outline-none">
          {t('commentsTitle', { count })}
        </h2>
        <CommentForm postId={postId} onAdded={added} />
        {status === 'loading' && <CommentsSkeleton />}
        {status === 'failed' && (
          <LoadFailed
            title={t('commentsFailed')}
            onRetry={() => {
              setStatus('loading')
              void readFirst()
            }}
          />
        )}
        {status === 'ready' && threads.length === 0 && (
          <p className="rounded-card border border-line bg-bg px-6 py-10 text-center text-ui text-ink-4">{t('commentsEmpty')}</p>
        )}
        {status === 'ready' && threads.length > 0 && (
          <ul className="flex flex-col rounded-card border border-line bg-bg">
            {threads.map((thread) => {
              const rest = thread.replyCount - thread.replies.length
              return (
                <li key={thread.id} className="border-b border-surface-2 px-4 py-5 last:border-b-0 sm:px-6">
                  {item(thread, thread)}
                  {replyBox(thread)}
                  {thread.replies.length > 0 && (
                    <ul aria-label={t('repliesLabel', { name: thread.author.name || t('anonymous') })} className="flex flex-col gap-4 pt-4 pl-13">
                      {thread.replies.map((answer) => (
                        <li key={answer.id}>
                          {item(answer, thread)}
                          {replyBox(answer)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {rest > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 pt-3 pl-13">
                      <button
                        type="button"
                        onClick={() => loadReplies(thread)}
                        disabled={thread.more === 'loading'}
                        className="min-h-8 text-meta text-link hover:underline disabled:opacity-60"
                      >
                        {t('moreReplies', { count: rest })}
                      </button>
                      {thread.more === 'failed' && (
                        <span role="alert" className="text-small text-down">
                          {t('repliesFailed')}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {status === 'ready' && (next !== null || more === 'failed') && (
          <div className="flex flex-wrap items-center gap-3">
            {next !== null && (
              <button type="button" onClick={loadMore} disabled={more === 'loading'} className={buttonClass('secondary', 'disabled:opacity-60')}>
                {t('moreComments')}
              </button>
            )}
            {more === 'failed' && (
              <span role="alert" className="text-meta text-down">
                {t('commentsFailed')}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

type CommentItemProps = {
  comment: CommentView
  /** Everyone sees it: it can be answered and reported. */
  open: boolean
  /** A comment's replies, which deleting it takes along; none on a reply. */
  replyCount: number
  reported: boolean
  onReport: () => void
  onReply: (opener: HTMLElement) => void
  onDelete: () => Promise<boolean>
}

/** One comment or reply: who and when,「回复 林栖」when it answers a reply, the text,「回复」and「更多」. */
function CommentItem({ comment, open, replyCount, reported, onReport, onReply, onDelete }: CommentItemProps) {
  const t = useTranslations('circles')
  const name = comment.author.name || t('anonymous')
  const isReply = comment.parent !== null
  return (
    <div className="flex gap-3">
      <ProfileLink handle={comment.author.handle} twin className="flex-none self-start rounded-pill">
        <PersonAvatar name={name} tone={comment.author.tone} size={isReply ? 'sm' : 'md'} />
      </ProfileLink>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 pt-1.5 text-meta text-ink-2">
            <ProfileLink handle={comment.author.handle} className="font-medium wrap-anywhere hover:underline">
              {comment.mine ? t('youNamed', { name }) : name}
            </ProfileLink>
            <span aria-hidden="true" className="text-ink-4">
              {' · '}
            </span>
            <span className="text-ink-4">
              <PostTime iso={comment.createdAt} />
            </span>
          </p>
          {(comment.mine || open) && (
            <MoreMenu
              small
              label={t('commentMore', { name })}
              mine={comment.mine}
              reported={reported}
              onReport={onReport}
              onDelete={onDelete}
              confirm={t('deleteCommentConfirm')}
              confirmNote={replyCount > 0 ? t('deleteCommentReplies', { count: replyCount }) : undefined}
            />
          )}
        </div>
        {comment.hidden && <p className="rounded-thumb bg-warn px-3 py-2 text-meta text-warn-ink">{t('commentHiddenNote')}</p>}
        <p className="text-body whitespace-pre-line wrap-anywhere">
          {comment.replyTo && <span className="text-ink-4">{t('replyTo', { name: comment.replyTo.name || t('anonymous') })}</span>}
          <span lang={comment.lang}>
            <LinkedText text={comment.body} />
          </span>
        </p>
        {open && (
          <div className="flex">
            <button
              type="button"
              onClick={(event) => onReply(event.currentTarget)}
              aria-label={t('replyName', { name })}
              className="-ml-2 min-h-8 rounded-thumb px-2 text-small text-ink-4 hover:bg-surface hover:text-ink"
            >
              {t('reply')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

type FormError = 'body' | 'tooLong' | 'commentDailyLimit' | 'replyGone' | 'postGone' | 'failed'

const formErrors: Partial<Record<CirclesError, FormError>> = {
  'empty-body': 'body',
  'body-too-long': 'tooLong',
  'daily-limit': 'commentDailyLimit',
  'invalid-reply': 'replyGone',
  'not-found': 'postGone',
}

/** What the error messages quote. */
const limits = { max: commentRules.maxBody, limit: commentRules.dailyComments }

type CommentFormProps = {
  postId: number
  /** The comment or reply it answers; without it the comment is on the post. */
  replyTo?: CommentView
  onAdded: (change: CommentChange) => void
  /** A reply box closes once sent, on「取消」or on Esc. */
  onClose?: () => void
}

/**
 * The box for a comment, at the top of the comments, or for a reply, under what it answers.
 * Visitors see the comment box as a button that asks them to sign in.
 */
function CommentForm({ postId, replyTo, onAdded, onClose }: CommentFormProps) {
  const t = useTranslations('circles')
  const locale = useLocale()
  const { signedIn, sessionPending, member, askToSignIn } = useCirclesSession()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<FormError | null>(null)
  const [sending, setSending] = useState(false)
  const fieldId = useId()
  const errorId = useId()
  const length = textLength(draft)
  const tooLong = length > commentRules.maxBody
  const label = replyTo ? t('replyName', { name: replyTo.author.name || t('anonymous') }) : t('commentLabel')
  const placeholder = replyTo ? t('replyPlaceholder', { name: replyTo.author.name || t('anonymous') }) : t('commentPlaceholder')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sessionPending) return
    if (!signedIn) return askToSignIn('comment')
    const body = cleanText(draft)
    if (!body) return setError('body')
    if (textLength(body) > commentRules.maxBody) return setError('tooLong')
    setError(null)
    setSending(true)
    const { data, status, error: refusal } = await request<CommentChange>(
      '/api/circles/comments',
      json({ post: postId, body, locale, ...(replyTo && { replyTo: replyTo.id }) }),
    )
    setSending(false)
    if (data) {
      setDraft('')
      onAdded(data)
      onClose?.()
      return
    }
    if (status === 401) return askToSignIn('comment')
    setError((refusal && formErrors[refusal]) ?? 'failed')
  }

  const field = 'w-full resize-y rounded-thumb border border-surface-2 bg-surface px-3 py-2.5 text-ui placeholder:text-ink-4'
  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onClose) {
          event.stopPropagation()
          onClose()
        }
      }}
      aria-label={label}
      className={replyTo ? 'flex flex-col gap-2' : 'flex gap-3 rounded-card border border-line bg-bg p-4'}
    >
      {!replyTo && member && <PersonAvatar name={member.name.trim() || t('anonymous')} tone={toneFor(member.id)} size="sm" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor={fieldId} className="sr-only">
          {label}
        </label>
        {signedIn || sessionPending ? (
          <textarea
            id={fieldId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (error === 'body' || error === 'tooLong') setError(null)
            }}
            disabled={sessionPending}
            // A reply box opens because the reader asked for it: straight to typing.
            autoFocus={replyTo !== undefined}
            placeholder={placeholder}
            aria-invalid={error === 'body' || error === 'tooLong' || tooLong}
            aria-describedby={error ? errorId : undefined}
            rows={replyTo ? 2 : 3}
            className={`${field} ${replyTo ? 'min-h-16' : 'min-h-20'}`}
          />
        ) : (
          // Visitors: the same box, as a button that asks them to sign in first.
          <button id={fieldId} type="button" onClick={() => askToSignIn('comment')} className={`${field} min-h-20 text-left text-ink-4`}>
            {placeholder}
          </button>
        )}
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {error && (
            <p id={errorId} role="alert" className="mr-auto text-small text-down">
              {t(`errors.${error}`, limits)}
            </p>
          )}
          {signedIn && length > 0 && (
            <span className={`text-small ${tooLong ? 'font-medium text-down' : 'text-ink-4'}`}>{t('charCount', { count: length, max: commentRules.maxBody })}</span>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="min-h-8 px-1 text-meta text-link hover:underline">
              {t('cancel')}
            </button>
          )}
          {/* One black button a screen: the reply box's is outlined, beside the comment box's. */}
          <button
            type="submit"
            disabled={sending || sessionPending}
            className={buttonClass(replyTo ? 'secondary' : 'primary', `${replyTo ? 'h-8' : 'h-9'} px-4 disabled:opacity-60`)}
          >
            {sending ? t('publishing') : replyTo ? t('reply') : t('publish')}
          </button>
        </div>
      </div>
    </form>
  )
}

function CommentsSkeleton() {
  const states = useTranslations('states')
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), skeletonDelayMs)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div role="status" aria-label={states('loadingList')} className="min-h-60 rounded-card border border-line bg-bg">
      {visible &&
        [72, 54].map((width) => (
          <div key={width} className="flex gap-3 border-b border-surface-2 px-4 py-5 last:border-b-0 sm:px-6">
            <Skeleton className="size-10 flex-none rounded-pill" />
            <span className="flex flex-1 flex-col gap-2.5 pt-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3" style={{ width: `${width}%` }} />
              <Skeleton className="h-3" style={{ width: `${width - 18}%` }} />
            </span>
          </div>
        ))}
    </div>
  )
}
