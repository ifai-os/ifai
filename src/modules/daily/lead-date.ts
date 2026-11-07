/**
 * A summary or paragraph that opens with the story's own date (「11 月 6 日，Meta 推出…」,
 * 「11月6日、…」, 「11월 6일, …」, "On Nov. 6, …") repeats what the page already shows above it
 * (2026-11-07 站长: 列表里每条开头都是日期). This drops that opening date and nothing else.
 *
 * Only a date at the very start is dropped, and only when it is the story's publish day give or
 * take one day (the writers counted days in their own time zone): a date that says something else,
 * such as when a law takes effect, stays. Written text is never otherwise changed.
 */

const prefix = String.raw`(?:(?:当地时间|當地時間|美国时间|美國時間|北京时间|北京時間|現地時間|현지\s*시간)\s*)?`
const local = String.raw`(?:\s*[（(](?:当地时间|當地時間|美国时间|美國時間|北京时间|北京時間|現地時間|현지\s*시간)[)）])?`

/** Chinese and Japanese: 「2026 年 11 月 6 日，」「11月6日、」. A comma must follow. */
const cjk = new RegExp(String.raw`^${prefix}(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日${local}\s*[，,、]\s*`)
/** Korean: 「11월 6일, 」 or 「11월 6일 」 (a comma is often left out). */
const korean = new RegExp(String.raw`^${prefix}(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일${local}(?:\s*[,，]\s*|\s+)`)
/** English: "On Nov. 6, " / "On November 6, 2026, ". */
const english = /^On\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?,\s+/i

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The publish day and the days on either side, as UTC calendar dates. */
function nearDays(publishedAt: Date | string): { year: number; month: number; day: number }[] {
  const time = new Date(publishedAt).getTime()
  if (Number.isNaN(time)) return []
  return [-1, 0, 1].map((offset) => {
    const at = new Date(time + offset * 86_400_000)
    return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() }
  })
}

function matches(days: ReturnType<typeof nearDays>, year: number | null, month: number, day: number): boolean {
  return days.some((near) => near.month === month && near.day === day && (year === null || near.year === year))
}

/** One piece of text without its opening date, when that date is the publish day. */
export function dropLeadDate(text: string, publishedAt: Date | string | null | undefined): string {
  if (!text || !publishedAt) return text
  const days = nearDays(publishedAt)
  if (!days.length) return text

  for (const pattern of [cjk, korean]) {
    const found = pattern.exec(text)
    if (!found) continue
    const rest = text.slice(found[0].length)
    if (!rest.trim()) return text
    return matches(days, found[1] ? Number(found[1]) : null, Number(found[2]), Number(found[3])) ? rest : text
  }
  const found = english.exec(text)
  if (found) {
    const rest = text.slice(found[0].length)
    const month = months.indexOf(found[1].toLowerCase().slice(0, 3)) + 1
    if (!rest.trim() || !matches(days, found[3] ? Number(found[3]) : null, month, Number(found[2]))) return text
    return rest.charAt(0).toUpperCase() + rest.slice(1)
  }
  return text
}

/** A story body (paragraphs split by blank lines, 「## 」 subheadings): each paragraph without its opening publish date. */
export function dropLeadDates(body: string, publishedAt: Date | string | null | undefined): string {
  if (!body || !publishedAt) return body
  return body
    .split(/(\n\s*\n)/)
    .map((part) => (part.trim() && !part.trimStart().startsWith('#') ? part.replace(/^(\s*)([\s\S]*)$/, (_all, space: string, rest: string) => space + dropLeadDate(rest, publishedAt)) : part))
    .join('')
}
