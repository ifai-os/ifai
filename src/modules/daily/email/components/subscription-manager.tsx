'use client'

import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useEffect, useRef, useState } from 'react'

import { buttonClass } from '@/components/button'
import type { Locale } from '@/i18n/config'

import type { ManageAction } from '../rules'
import type { SubscriptionView, ZoneOption } from '../view'

type Notice = 'saved' | 'unsubscribed' | 'resubscribed' | 'failed'

type SubscriptionManagerProps = {
  token: string
  initial: SubscriptionView
  /** Opened from「退订」in an email: unsubscribe straight away. */
  unsubscribeOnOpen: boolean
  zones: ZoneOption[]
  languages: { value: Locale; label: string }[]
}

const select = 'h-11 w-full rounded-thumb border border-line bg-bg px-3 text-ui text-ink outline-none focus:border-ink-4'

/**
 * The manage page's controls (docs/specs/daily-email.md「页面与路由」): the address, masked, and
 * its status; language and time zone while subscribed; unsubscribe, or subscribe again after an
 * unsubscribe, a bounce or a complaint. Every change goes through the token from the email.
 */
export function SubscriptionManager({ token, initial, unsubscribeOnOpen, zones, languages }: SubscriptionManagerProps) {
  const t = useTranslations('subscription')
  const pageLocale = useLocale()
  const leaving = unsubscribeOnOpen && initial.status === 'subscribed'
  const [view, setView] = useState(initial)
  const [locale, setLocale] = useState(initial.locale)
  const [timeZone, setTimeZone] = useState(initial.timeZone)
  const [busy, setBusy] = useState(leaving)
  const [notice, setNotice] = useState<Notice | null>(null)
  const started = useRef(false)

  async function post(action: ManageAction['type']): Promise<SubscriptionView | null> {
    try {
      const response = await fetch('/api/subscriptions/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pageLocale, action, locale, timeZone }),
      })
      return response.ok ? ((await response.json()) as SubscriptionView) : null
    } catch {
      return null
    }
  }

  function show(next: SubscriptionView | null, done: Notice) {
    if (next) {
      setView(next)
      setLocale(next.locale)
      setTimeZone(next.timeZone)
    }
    setNotice(next ? done : 'failed')
    setBusy(false)
  }

  async function act(action: ManageAction['type'], done: Notice) {
    setBusy(true)
    setNotice(null)
    show(await post(action), done)
  }

  // The link only unsubscribes in a browser that runs the page, not when a mail scanner fetches it.
  useEffect(() => {
    if (!leaving || started.current) return
    started.current = true
    void post('unsubscribe').then((next) => show(next, 'unsubscribed'))
    // Once, as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void act('update', 'saved')
  }

  const resubscribable = view.status === 'unsubscribed' || (view.status === 'stopped' && view.stopReason !== 'owner')

  return (
    <div className="flex flex-col gap-6" aria-busy={busy}>
      <dl className="flex flex-col gap-4 rounded-card border border-line p-5">
        <div className="flex flex-col gap-1">
          <dt className="text-meta text-ink-4">{t('address')}</dt>
          <dd className="text-ui font-medium break-all">{view.email}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-meta text-ink-4">{t('statusLabel')}</dt>
          <dd className="flex flex-col gap-1">
            <span className={`text-ui font-medium ${view.status === 'subscribed' ? 'text-up' : 'text-ink'}`}>{t(`status.${view.status}`)}</span>
            {view.stopReason && <span className="text-meta text-ink-3">{t(`stopped.${view.stopReason}`)}</span>}
            {view.next && <span className="text-meta text-ink-3">{t('next', view.next)}</span>}
          </dd>
        </div>
      </dl>

      {/* Always there, so screen readers announce the notice; out of the layout while empty. */}
      <div role="status" className={notice && notice !== 'failed' ? undefined : 'sr-only'}>
        {notice && notice !== 'failed' && <p className="rounded-card bg-success-soft p-4 text-ui text-success-ink">{t(notice)}</p>}
      </div>
      {notice === 'failed' && (
        <p role="alert" className="text-small text-down">
          {t('failed')}
        </p>
      )}

      {view.status === 'subscribed' && (
        <form onSubmit={save} className="flex flex-col gap-4 rounded-card border border-line p-5">
          <h2 className="text-title font-semibold">{t('settings')}</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-ink-2">{t('language')}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} className={select}>
              {languages.map((option) => (
                <option key={option.value} value={option.value} lang={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-ink-2">{t('timeZone')}</span>
            <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={select}>
              {zones.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-small text-ink-4">{t('timeZoneHint')}</span>
          </label>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'self-start disabled:opacity-60')}>
            {t('save')}
          </button>
        </form>
      )}

      {view.status === 'subscribed' && (
        <button type="button" disabled={busy} onClick={() => void act('unsubscribe', 'unsubscribed')} className={buttonClass('secondary', 'self-start disabled:opacity-60')}>
          {t('unsubscribe')}
        </button>
      )}
      {resubscribable && (
        <button type="button" disabled={busy} onClick={() => void act('resubscribe', 'resubscribed')} className={buttonClass('primary', 'self-start disabled:opacity-60')}>
          {t('resubscribe')}
        </button>
      )}
    </div>
  )
}
