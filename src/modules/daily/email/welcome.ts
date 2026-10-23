import type { Subscriber } from '@/payload-types'

import { emailFooter, emailLogo, emailTranslator } from './compose'
import type { OutgoingEmail } from './delivery'
import { sendTimeLabel, zoneName } from './format'
import { emailColors, emailHtml, escapeHtml, footerText } from './layout'
import { subscriptionLinks, unsubscribeHeaders } from './links'
import { nextSendAt } from './schedule'

type WelcomeTo = Pick<Subscriber, 'id' | 'email' | 'locale' | 'timeZone'>

/**
 * The welcome email (docs/specs/daily-email.md rule 3), sent the moment someone subscribes:
 * when the email comes and in which time zone, when the first one arrives, how to change the
 * language and time zone, and a one-click way out for someone who never asked for it.
 */
export async function buildWelcomeEmail(subscriber: WelcomeTo, now: Date): Promise<OutgoingEmail> {
  const { locale, timeZone } = subscriber
  const t = await emailTranslator(locale)
  const links = subscriptionLinks(subscriber.id, locale)
  const footer = emailFooter(t, links)
  const first = sendTimeLabel(nextSendAt(now, timeZone), timeZone, locale)
  const zone = zoneName(timeZone, locale, now)
  const c = emailColors
  const paragraph = `margin:0 0 12px;font-size:15px;line-height:1.75;color:${c.ink2}`

  const lines = {
    heading: t('welcome.heading'),
    schedule: t('welcome.schedule', { zone }),
    first: t('welcome.first', { time: first }),
    change: t('welcome.change'),
    notYou: t('welcome.notYou'),
  }
  // "不是你订阅的？一键退订" needs no space after full-width punctuation; "Didn't sign up for this? Unsubscribe" does.
  const gap = /[\u3000-\u303f\uff00-\uffef]$/.test(lines.notYou) ? '' : ' '

  const body = `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.4;font-weight:600;color:${c.ink}">${escapeHtml(lines.heading)}</h1>
<p style="${paragraph}">${escapeHtml(lines.schedule)}</p>
<p style="${paragraph}">${escapeHtml(lines.first)}</p>
<p style="${paragraph};margin-bottom:24px">${escapeHtml(lines.change)}</p>
<a href="${escapeHtml(links.manage)}" style="display:inline-block;padding:12px 24px;border-radius:6px;background:${c.ink};color:#FFFFFF;font-size:15px;font-weight:500;text-decoration:none">${escapeHtml(t('welcome.manage'))}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${c.ink4}">${escapeHtml(lines.notYou)}${gap}<a href="${escapeHtml(links.unsubscribe)}" style="color:${c.link}">${escapeHtml(t('welcome.unsubscribe'))}</a></p>`

  const subject = t('welcome.subject')
  const html = emailHtml({
    locale,
    title: subject,
    preheader: t('welcome.preheader', { time: first }),
    brand: t('senderName'),
    logo: emailLogo(),
    body,
    footer,
  })
  const text = [
    lines.heading,
    '',
    lines.schedule,
    lines.first,
    lines.change,
    '',
    `${t('welcome.manage')}: ${links.manage}`,
    `${lines.notYou}${gap}${t('welcome.unsubscribe')}: ${links.unsubscribe}`,
    '',
    footerText(footer),
    '',
  ].join('\n')

  return {
    to: subscriber.email,
    senderName: t('senderName'),
    subject,
    html,
    text,
    headers: unsubscribeHeaders(links),
    kind: 'daily_welcome',
    // A bounce of the welcome email stops the subscription at once (rule 3).
    tags: { subscriber: String(subscriber.id) },
  }
}
