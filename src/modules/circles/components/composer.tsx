'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, type FormEvent } from 'react'

import { buttonClass } from '@/components/button'
import { toneFor } from '@/components/cards/initial-tile'
import { cleanText, textLength } from '@/modules/apps/reviews/rules'

import { circleRules } from '../rules'
import { useCircles, type PublishResult } from './circles-provider'
import { PersonAvatar } from './person-avatar'

type FormError = 'circle' | 'body' | 'tooLong' | 'dailyLimit' | 'gone' | 'failed'

const errorOf: Partial<Record<PublishResult, FormError>> = {
  'invalid-circle': 'circle',
  'empty-body': 'body',
  'body-too-long': 'tooLong',
  'daily-limit': 'dailyLimit',
  'not-found': 'gone',
}

/**
 * 「发布动态」: the text and the circle it goes to. Visitors see the same box; pressing it asks
 * them to sign in. Pictures, video links and polls are not here yet (docs/specs/circles.md「设计稿」).
 */
export function Composer() {
  const t = useTranslations('circles')
  const { circles, byId, circle, joined, signedIn, sessionPending, member, publish, askToSignIn } = useCircles()
  const [draft, setDraft] = useState('')
  const [chosen, setChosen] = useState<number | null>(null)
  const [error, setError] = useState<FormError | null>(null)
  const [sending, setSending] = useState(false)
  const fieldId = useId()
  const errorId = useId()

  // The circle being looked at, else the first one they joined; their own pick wins.
  const target = chosen ?? circle?.id ?? joined.find((id) => byId.has(id)) ?? null
  const length = textLength(draft)
  const tooLong = length > circleRules.maxBody
  const name = member?.name.trim() || t('anonymous')

  if (circles.length === 0) return null

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!signedIn) {
      askToSignIn('post')
      return
    }
    const body = cleanText(draft)
    if (target === null) return setError('circle')
    if (!body) return setError('body')
    if (textLength(body) > circleRules.maxBody) return setError('tooLong')
    setError(null)
    setSending(true)
    const result = await publish(target, body)
    setSending(false)
    if (result === 'ok') {
      setDraft('')
      return
    }
    if (result !== 'sign-in') setError(errorOf[result] ?? 'failed')
  }

  return (
    <form onSubmit={send} aria-label={t('composerLabel')} className="flex flex-col gap-3 rounded-hero border border-surface-2 bg-surface px-4 py-4 sm:px-5">
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
              if (error === 'body' || error === 'tooLong') setError(null)
            }}
            disabled={sessionPending}
            placeholder={t('placeholder')}
            aria-invalid={error === 'body' || error === 'tooLong' || tooLong}
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:pl-13">
        <label className="flex min-h-9 items-center gap-1.5 text-meta text-ink-2">
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
          {t(`errors.${error}`, { max: circleRules.maxBody, limit: circleRules.dailyPosts })}
        </p>
      )}
    </form>
  )
}
