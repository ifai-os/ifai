import type { Locale } from '@/i18n/config'

/**
 * The frame every daily email shares (docs/specs/daily-email.md「邮件」): the IFAI tile and name
 * on the light grey page, the content on a white card, and the footer with why it came, manage,
 * unsubscribe, the site and the sending address. Tables and inline styles, because that is what
 * mail clients render; colors are the design tokens written out (no CSS variables in email).
 */
export const emailColors = {
  page: '#F7F7F9',
  card: '#FFFFFF',
  ink: '#000000',
  ink2: '#48494C',
  ink3: '#606266',
  ink4: '#6F7174',
  line: '#E4E4E5',
  link: '#0355E3',
} as const

/** System fonts per language, as on the site (no web fonts). */
const fontStacks: Record<Locale, string> = {
  en: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
  'zh-Hans': "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif",
  'zh-Hant': "-apple-system,BlinkMacSystemFont,'PingFang TC','Microsoft JhengHei',sans-serif",
  ja: "-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic UI',Meiryo,sans-serif",
  ko: "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type EmailFooter = {
  /** "You're receiving this because you subscribed to the IFAI Daily." */
  why: string
  manage: { label: string; href: string }
  unsubscribe: { label: string; href: string }
  site: { name: string; href: string }
  /** The sending address, when one is configured. */
  sender: string | null
}

type EmailPage = {
  locale: Locale
  /** The subject, as the document title. */
  title: string
  /** The line inbox lists show after the subject. */
  preheader: string
  /** The name beside the tile: the sender name. */
  brand: string
  /** Absolute URL of the PNG tile (many clients do not show SVG). */
  logo: string
  /** The card's content, already HTML. */
  body: string
  footer: EmailFooter
}

export function emailHtml({ locale, title, preheader, brand, logo, body, footer }: EmailPage): string {
  const c = emailColors
  const footerLink = `color:${c.ink4};text-decoration:underline`
  const sender = footer.sender ? ` · ${escapeHtml(footer.sender)}` : ''
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${c.page}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.page}">
<tr><td align="center" style="padding:32px 16px;font-family:${fontStacks[locale]};color:${c.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px">
<a href="${escapeHtml(footer.site.href)}" style="color:${c.ink};text-decoration:none"><img src="${escapeHtml(logo)}" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:7px"><span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:15px;font-weight:600">${escapeHtml(brand)}</span></a>
</td></tr>
<tr><td style="background:${c.card};border-radius:16px;padding:32px 28px">
${body}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.7;color:${c.ink4}">
<p style="margin:0 0 6px">${escapeHtml(footer.why)}</p>
<p style="margin:0 0 6px"><a href="${escapeHtml(footer.manage.href)}" style="${footerLink}">${escapeHtml(footer.manage.label)}</a> · <a href="${escapeHtml(footer.unsubscribe.href)}" style="${footerLink}">${escapeHtml(footer.unsubscribe.label)}</a></p>
<p style="margin:0"><a href="${escapeHtml(footer.site.href)}" style="color:${c.ink4};text-decoration:none">${escapeHtml(footer.site.name)}</a>${sender}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

/** The same footer for the plain-text version. */
export function footerText(footer: EmailFooter): string {
  return [
    '--',
    footer.why,
    `${footer.manage.label}: ${footer.manage.href}`,
    `${footer.unsubscribe.label}: ${footer.unsubscribe.href}`,
    [footer.site.name, footer.site.href, footer.sender].filter(Boolean).join(' · '),
  ].join('\n')
}
