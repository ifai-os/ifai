/** The parts of an IFAI email, all plain text: the layout escapes every one of them. */
export type EmailContent = {
  /** Payload / BCP 47 code: zh-Hans, ja … */
  locale: string
  heading: string
  paragraphs: string[]
  /** Label–value rows in a grey box, such as a submission number and a repository address. */
  details?: { label: string; value: string }[]
  /** A caption and short lines under it, such as the files and lines a scan flagged. */
  list?: { caption: string; items: string[] }
  /** A caption and a quoted passage, such as a note from the site owner. */
  quote?: { caption: string; text: string }
  button?: { label: string; href: string }
  /** Small grey line at the bottom. */
  footer?: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const fonts = "-apple-system,system-ui,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans','Apple SD Gothic Neo',sans-serif"
const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>')

/** One white card on a light grey page, inline styles only, so mail apps show it the same way. */
export function emailHtml(content: EmailContent): string {
  const parts = [`<h1 style="margin:0 0 12px;font-size:22px;font-weight:600">${escapeHtml(content.heading)}</h1>`]
  for (const paragraph of content.paragraphs) {
    parts.push(`<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#48494C">${lines(paragraph)}</p>`)
  }
  if (content.details?.length) {
    const rows = content.details
      .map(
        ({ label, value }) =>
          `<tr><td style="padding:4px 16px 4px 0;font-size:13px;color:#6F7174;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:13px;color:#000000;word-break:break-all">${escapeHtml(value)}</td></tr>`,
      )
      .join('')
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#F7F7F9;border-radius:8px"><tr><td style="padding:12px 16px"><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`,
    )
  }
  if (content.quote) {
    parts.push(`<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#000000">${escapeHtml(content.quote.caption)}</p>`)
    parts.push(
      `<p style="margin:0 0 16px;padding:0 0 0 12px;border-left:3px solid #E4E4E5;font-size:15px;line-height:1.75;color:#48494C">${lines(content.quote.text)}</p>`,
    )
  }
  if (content.list?.items.length) {
    const items = content.list.items
      .map((item) => `<li style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#48494C;word-break:break-word">${escapeHtml(item)}</li>`)
      .join('')
    parts.push(`<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#000000">${escapeHtml(content.list.caption)}</p>`)
    parts.push(`<ul style="margin:0 0 16px;padding:0 0 0 20px">${items}</ul>`)
  }
  if (content.button) {
    parts.push(
      `<p style="margin:8px 0 0"><a href="${escapeHtml(content.button.href)}" style="display:inline-block;padding:12px 24px;border-radius:6px;background:#000000;color:#FFFFFF;font-size:15px;font-weight:500;text-decoration:none">${escapeHtml(content.button.label)}</a></p>`,
    )
  }
  if (content.footer) {
    parts.push(`<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6F7174">${escapeHtml(content.footer)}</p>`)
  }

  return `<!doctype html>
<html lang="${escapeHtml(content.locale)}">
  <body style="margin:0;padding:32px 16px;background:#F7F7F9;font-family:${fonts};color:#000000">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px">
      <tr><td style="padding:32px">
        ${parts.join('\n        ')}
      </td></tr>
    </table>
  </body>
</html>`
}

/** The same email as plain text, for mail apps that do not show HTML. */
export function emailText(content: EmailContent): string {
  const blocks = [content.heading, ...content.paragraphs]
  if (content.details?.length) blocks.push(content.details.map(({ label, value }) => `${label}: ${value}`).join('\n'))
  if (content.quote) blocks.push(`${content.quote.caption}\n${content.quote.text}`)
  if (content.list?.items.length) blocks.push([content.list.caption, ...content.list.items.map((item) => `- ${item}`)].join('\n'))
  if (content.button) blocks.push(content.button.href)
  if (content.footer) blocks.push(content.footer)
  return `${blocks.join('\n\n')}\n`
}
