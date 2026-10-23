'use client'

import { Button, useTranslation } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

import { localeNames, locales, type Locale } from '@/i18n/config'

import type { SendCounts, SubscriberOverview as Overview } from '../overview'

type Preview = { subject: string; from: string; html: string; bytes: number } | { empty: true }
type TestResult = { sent: true; to: string; printed: boolean } | { error: string; message?: string }

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '订阅者',
    subscribed: (count: number) => `已订阅 ${count} 人`,
    separator: '：',
    others: (unsubscribed: number, stopped: number) => `已退订 ${unsubscribed} 人，已停发 ${stopped} 人。`,
    today: '今天的发送（上海时间）',
    sent: (sent: number, counts: SendCounts) =>
      `已发 ${sent} 封：送达 ${counts.delivered}，退信 ${counts.bounced}，投诉 ${counts.complained}；失败 ${counts.failed}${counts.sending ? `，发送中 ${counts.sending}` : ''}。`,
    noneToday: '今天还没有发出日报邮件。',
    free: (used: number, remaining: number, limit: number) => `Resend 免费版每天 ${limit} 封（UTC 0 点重置，和登录邮件共用）：今天已用 ${used}，还剩 ${remaining}`,
    readAt: (time: string) => `（${time} 发信时 Resend 的读数）`,
    ownCount: '（本站发出的数，不含登录邮件）',
    paid: (monthly: number | null) => `Resend 付费套餐，没有每天的上限${monthly === null ? '' : `；本月已用 ${monthly} 封`}。`,
    low: '今天的额度快用完了。用完以后，还没发的会在额度恢复（UTC 0 点）后、各自当地 11 点前补发。',
    upgrade: (count: number) => `订阅者有 ${count} 人了，免费版每天 100 封快不够了（还要算上登录邮件）。该换 Pro：Resend → Settings → Billing。`,
    lastFailure: (time: string, message: string) => `最近一次失败（${time}）：${message}`,
    off: '开关 DAILY_EMAIL_ENABLED 关着：不发日报邮件，订阅框也不显示。预览和测试邮件照常可用。',
    notConfigured: '这个环境没配好 Resend（RESEND_API_KEY、DAILY_EMAIL_FROM）：日报邮件和测试邮件都发不出去。',
    printed: '本地没配 Resend：邮件不发出去，打印在终端里。',
    preview: '预览邮件',
    closePreview: '收起预览',
    language: '语言',
    test: (email: string) => `发测试邮件到 ${email}`,
    sending: '发送中…',
    testSent: (email: string) => `已发到 ${email}，不记发送记录。`,
    testPrinted: '已打印在终端里（本地没配 Resend）。',
    testFailed: (reason: string) => `没发出去：${reason}`,
    reasons: { no_stories: '过去 24 小时没有已发布的新闻。', not_configured: '这个环境没配好 Resend。', failed: '出错了，刷新试试。' } as Record<string, string>,
    empty: '过去 24 小时没有已发布的新闻，此刻不会发出邮件。',
    meta: (from: string, subject: string, size: string) => `发件人：${from} · 主题：${subject} · ${size} KB`,
    frame: '邮件预览',
    loading: '…',
    failed: '读不出来，刷新试试。',
  },
  en: {
    title: 'Subscribers',
    subscribed: (count: number) => `${count} subscribed`,
    separator: ': ',
    others: (unsubscribed: number, stopped: number) => `${unsubscribed} unsubscribed, ${stopped} stopped.`,
    today: 'Sent today (Shanghai time)',
    sent: (sent: number, counts: SendCounts) =>
      `${sent} sent: ${counts.delivered} delivered, ${counts.bounced} bounced, ${counts.complained} marked as spam; ${counts.failed} failed${counts.sending ? `, ${counts.sending} sending` : ''}.`,
    noneToday: 'No daily email has gone out today.',
    free: (used: number, remaining: number, limit: number) =>
      `Resend free plan, ${limit} a day (resets at 00:00 UTC, shared with sign-in emails): ${used} used today, ${remaining} left`,
    readAt: (time: string) => ` (Resend’s count at the send at ${time})`,
    ownCount: ' (this site’s own count, sign-in emails not included)',
    paid: (monthly: number | null) => `Resend paid plan, no daily limit${monthly === null ? '' : `; ${monthly} used this month`}.`,
    low: 'Today’s quota is nearly used up. Once it is, emails not yet sent go out when it comes back (00:00 UTC), as long as it is still before 11:00 for the reader.',
    upgrade: (count: number) => `${count} subscribers: the free plan’s 100 a day will soon not be enough (sign-in emails count too). Time for Pro: Resend → Settings → Billing.`,
    lastFailure: (time: string, message: string) => `Last failure (${time}): ${message}`,
    off: 'DAILY_EMAIL_ENABLED is off: no daily email goes out and the subscribe boxes are hidden. Preview and test emails still work.',
    notConfigured: 'Resend is not set up here (RESEND_API_KEY, DAILY_EMAIL_FROM): neither the daily nor a test email can go out.',
    printed: 'Resend is not set up locally: emails are printed in the terminal instead.',
    preview: 'Preview the email',
    closePreview: 'Close the preview',
    language: 'Language',
    test: (email: string) => `Send a test email to ${email}`,
    sending: 'Sending…',
    testSent: (email: string) => `Sent to ${email}; not recorded as a send.`,
    testPrinted: 'Printed in the terminal (Resend is not set up locally).',
    testFailed: (reason: string) => `Not sent: ${reason}`,
    reasons: { no_stories: 'Nothing was published in the past 24 hours.', not_configured: 'Resend is not set up here.', failed: 'Something went wrong; try reloading.' } as Record<string, string>,
    empty: 'Nothing was published in the past 24 hours, so no email would go out now.',
    meta: (from: string, subject: string, size: string) => `From: ${from} · Subject: ${subject} · ${size} KB`,
    frame: 'Email preview',
    loading: '…',
    failed: 'Could not load this; try reloading.',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const
const line = { margin: '0.25em 0 0' } as const
const warn = { ...line, color: 'var(--theme-warning-700)' } as const
const heading = { margin: '0.75em 0 0', fontWeight: 600 } as const

/** The endpoint's JSON; with `errors`, an error answer ({ error }) comes back instead of throwing. */
async function getJson<T>(url: string, init?: RequestInit, errors = false): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const body = (await response.json().catch(() => null)) as T | null
  if (body && (response.ok || (errors && typeof body === 'object' && 'error' in body))) return body
  throw new Error(`HTTP ${response.status}`)
}

/**
 * Above the subscriber list (docs/specs/daily-email.md「后台」): readers per language, today's
 * sends, Resend's quota and its last refusal, then the email as it would go out now in any
 * language, and a test email to yourself.
 */
export function SubscriberOverview() {
  const { i18n } = useTranslation()
  const zh = i18n.language.startsWith('zh')
  const t = zh ? text.zh : text.en
  const time = (at: string) => new Date(at).toLocaleString(zh ? 'zh-CN' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const [data, setData] = useState<Overview | null | 'failed'>(null)
  const [locale, setLocale] = useState<Locale>(zh ? 'zh-Hans' : 'en')
  const [preview, setPreview] = useState<Preview | null | 'loading' | 'failed'>(null)
  const [open, setOpen] = useState(false)
  const [test, setTest] = useState<TestResult | 'sending' | null>(null)
  // Only the latest language's preview is shown, whatever order the answers come in.
  const previewRequest = useRef(0)

  useEffect(() => {
    getJson<Overview>('/api/subscribers/overview')
      .then(setData)
      .catch(() => setData('failed'))
  }, [])

  function loadPreview(language: Locale) {
    const request = ++previewRequest.current
    setPreview('loading')
    getJson<Preview>(`/api/subscribers/preview?locale=${encodeURIComponent(language)}`)
      .then((result) => request === previewRequest.current && setPreview(result))
      .catch(() => request === previewRequest.current && setPreview('failed'))
  }

  function togglePreview() {
    setOpen(!open)
    if (!open) loadPreview(locale)
  }

  function changeLocale(language: Locale) {
    setLocale(language)
    setTest(null)
    if (open) loadPreview(language)
  }

  async function sendTest() {
    setTest('sending')
    try {
      setTest(
        await getJson<TestResult>(
          '/api/subscribers/test-email',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale }) },
          true,
        ),
      )
    } catch {
      setTest({ error: 'failed' })
    }
  }

  if (data === null || data === 'failed') {
    return (
      <div style={box}>
        <strong>{t.title}</strong>
        <p style={line}>{data === null ? t.loading : t.failed}</p>
      </div>
    )
  }

  const { counts } = data.today
  const sent = counts.sent + counts.delivered + counts.bounced + counts.complained
  const anyToday = sent + counts.failed + counts.sending > 0
  const { quota } = data

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      <p style={line}>
        {t.subscribed(data.subscribed)}
        {data.subscribed > 0 && `${t.separator}${locales.map((code) => `${localeNames[code]} ${data.byLocale[code]}`).join(' · ')}`}
      </p>
      <p style={line}>{t.others(data.unsubscribed, data.stopped)}</p>

      <p style={heading}>{t.today}</p>
      {!data.sending.enabled && <p style={warn}>{t.off}</p>}
      {data.sending.deployed && !data.sending.configured && <p style={warn}>{t.notConfigured}</p>}
      {!data.sending.deployed && !data.sending.configured && <p style={line}>{t.printed}</p>}
      <p style={line}>{anyToday ? t.sent(sent, counts) : t.noneToday}</p>
      <p style={quota.plan === 'free' && quota.low ? warn : line}>
        {quota.plan === 'free' ? `${t.free(quota.used, quota.remaining, quota.limit)}${quota.readAt ? t.readAt(time(quota.readAt)) : t.ownCount}` : t.paid(quota.monthlyUsed)}
      </p>
      {quota.plan === 'free' && quota.low && <p style={warn}>{t.low}</p>}
      {data.upgrade && <p style={warn}>{t.upgrade(data.subscribed)}</p>}
      {data.lastFailure && <p style={warn}>{t.lastFailure(time(data.lastFailure.at), data.lastFailure.message)}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'calc(var(--base) * 0.5)', marginTop: 'calc(var(--base) * 0.75)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
          {t.language}
          <select value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
            {locales.map((code) => (
              <option key={code} value={code} lang={code}>
                {localeNames[code]}
              </option>
            ))}
          </select>
        </label>
        <Button buttonStyle="secondary" margin={false} size="small" onClick={togglePreview}>
          {open ? t.closePreview : t.preview}
        </Button>
        {data.you && (
          <Button buttonStyle="secondary" disabled={test === 'sending'} margin={false} size="small" onClick={() => void sendTest()}>
            {test === 'sending' ? t.sending : t.test(data.you)}
          </Button>
        )}
      </div>
      {test && test !== 'sending' && (
        <p role="status" style={'error' in test ? warn : line}>
          {'error' in test ? t.testFailed(test.message ?? t.reasons[test.error] ?? test.error) : test.printed ? t.testPrinted : t.testSent(test.to)}
        </p>
      )}

      {open && (
        <div style={{ marginTop: 'calc(var(--base) * 0.75)' }}>
          {preview === 'loading' && <p style={line}>{t.loading}</p>}
          {preview === 'failed' && <p style={warn}>{t.failed}</p>}
          {preview && typeof preview === 'object' && 'empty' in preview && <p style={line}>{t.empty}</p>}
          {preview && typeof preview === 'object' && 'html' in preview && (
            <>
              <p style={line}>{t.meta(preview.from, preview.subject, (preview.bytes / 1024).toFixed(1))}</p>
              <iframe
                title={t.frame}
                // Links open in a new tab; nothing in the email runs.
                srcDoc={preview.html.replace('<head>', '<head><base target="_blank">')}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                style={{ display: 'block', width: '100%', height: 900, marginTop: '0.5em', border: '1px solid var(--theme-elevation-150)', borderRadius: 'var(--style-radius-m)' }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
