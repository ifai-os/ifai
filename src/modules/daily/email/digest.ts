import { localizePath, type Locale } from '@/i18n/config'
import type { InLanguage } from '@/lib/i18n/localized'
import { siteUrl } from '@/lib/site-url'

import { listHref, storyHref } from '../public/list-params'
import { categoryNames, emailFooter, emailLogo, emailTranslator } from './compose'
import type { DigestStory } from './content'
import type { OutgoingEmail } from './delivery'
import { emailColors, emailHtml, escapeHtml, footerText } from './layout'
import { previewLinks, subscriptionLinks, unsubscribeHeaders } from './links'

export type DigestTo = {
  email: string
  locale: Locale
  /** The subscriber, for the signed links and the one-click headers; null for the back office's preview and test email. */
  subscriberId: number | null
  /** The email_sends row, for the delivery webhooks. */
  sendId?: number
}

/** "10月24日星期六" / "Saturday, October 24": the subscriber's own calendar date, in their language. */
export function digestDate(localDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${localDate}T00:00:00Z`),
  )
}

/** Text in another language than the email's (English where a translation is missing) says which. */
function langOf(text: InLanguage<string> | null, locale: Locale): string {
  return text && text.lang !== locale ? ` lang="${text.lang}"` : ''
}

/**
 * The morning email (docs/specs/daily-email.md「邮件」): the subscriber's date and "the past 24
 * hours · N stories", the top story on its own with its summary, the rest numbered with their
 * summaries and "category · publisher", and a button to the daily list. Every title links to
 * the story's page in the subscriber's language; no tracking, no rewritten links. The same
 * inputs always give the same email, so a retried batch matches the first try.
 */
export async function buildDigestEmail(to: DigestTo, localDate: string, stories: readonly DigestStory[]): Promise<OutgoingEmail> {
  if (!stories.length) throw new Error('A morning email needs at least one story.')
  const { locale } = to
  const t = await emailTranslator(locale)
  const category = await categoryNames(locale)
  const links = to.subscriberId === null ? previewLinks(locale) : subscriptionLinks(to.subscriberId, locale)
  const footer = emailFooter(t, links)
  const origin = siteUrl()
  const c = emailColors
  const count = stories.length

  const items = stories.map((story) => ({
    title: story.title[locale],
    summary: story.summary[locale],
    meta: [category(story.category), story.source].filter(Boolean).join(' · '),
    href: `${origin}${localizePath(locale, storyHref(story.slug))}`,
  }))
  const [top, ...rest] = items
  const date = digestDate(localDate, locale)
  const intro = t('digest.intro', { count })
  const all = { label: t('digest.all'), href: `${origin}${localizePath(locale, listHref())}` }
  const summaryHtml = (summary: InLanguage<string> | null, style: string) =>
    summary ? `<p style="${style}"${langOf(summary, locale)}>${escapeHtml(summary.value)}</p>` : ''
  const metaStyle = `margin:6px 0 0;font-size:12px;line-height:1.5;color:${c.ink4}`

  const list = rest
    .map((item, index) => {
      const line = index < rest.length - 1 ? `border-bottom:1px solid ${c.line};` : ''
      return `<tr>
<td width="28" valign="top" style="padding:18px 0;${line}font-size:15px;line-height:1.5;font-weight:600;color:${c.ink4}">${index + 2}</td>
<td valign="top" style="padding:18px 0;${line}">
<a href="${escapeHtml(item.href)}" style="font-size:16px;line-height:1.5;font-weight:600;color:${c.ink};text-decoration:none"${langOf(item.title, locale)}>${escapeHtml(item.title.value)}</a>
${summaryHtml(item.summary, `margin:6px 0 0;font-size:14px;line-height:1.7;color:${c.ink2}`)}
<p style="${metaStyle}">${escapeHtml(item.meta)}</p>
</td>
</tr>`
    })
    .join('\n')

  const body = `<p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:${c.ink4}">${escapeHtml(date)}</p>
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.4;font-weight:600;color:${c.ink}">${escapeHtml(intro)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.page};border-radius:12px">
<tr><td style="padding:20px">
<p style="margin:0 0 8px;font-size:12px;line-height:1.5;font-weight:600;color:${c.ink3}">${escapeHtml(t('digest.top'))}</p>
<h2 style="margin:0 0 8px;font-size:19px;line-height:1.45;font-weight:600"><a href="${escapeHtml(top.href)}" style="color:${c.ink};text-decoration:none"${langOf(top.title, locale)}>${escapeHtml(top.title.value)}</a></h2>
${summaryHtml(top.summary, `margin:0;font-size:15px;line-height:1.75;color:${c.ink2}`)}
<p style="${metaStyle};margin-top:10px">${escapeHtml(top.meta)}</p>
</td></tr>
</table>
${rest.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0">\n${list}\n</table>` : ''}
<p style="margin:24px 0 0"><a href="${escapeHtml(all.href)}" style="display:inline-block;padding:12px 24px;border-radius:6px;background:${c.ink};color:#FFFFFF;font-size:15px;font-weight:500;text-decoration:none">${escapeHtml(all.label)}</a></p>`

  const subject = t('digest.subject', { title: top.title.value, count })
  const preheader = rest.length ? rest.slice(0, 2).map((item) => item.title.value).join(' · ') : (top.summary?.value ?? intro)
  const html = emailHtml({ locale, title: subject, preheader, brand: t('senderName'), logo: emailLogo(), body, footer })

  const block = (item: (typeof items)[number], heading: string) =>
    [heading, item.summary?.value, item.meta, item.href].filter((line): line is string => Boolean(line)).join('\n')
  const text = [
    date,
    intro,
    '',
    block(top, `${t('digest.top')}\n${top.title.value}`),
    ...rest.map((item, index) => `\n${block(item, `${index + 2}. ${item.title.value}`)}`),
    '',
    `${all.label}: ${all.href}`,
    '',
    footerText(footer),
    '',
  ].join('\n')

  const tags: Record<string, string> = {}
  if (to.subscriberId !== null) tags.subscriber = String(to.subscriberId)
  if (to.sendId !== undefined) tags.send = String(to.sendId)

  return {
    to: to.email,
    senderName: t('senderName'),
    subject,
    html,
    text,
    headers: to.subscriberId === null ? {} : unsubscribeHeaders(links),
    // A test email from the back office is not a reader's: the webhooks leave it alone.
    kind: to.subscriberId === null ? 'daily_test' : 'daily',
    tags,
  }
}
