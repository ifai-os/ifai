import type { Payload } from 'payload'

import { getDb } from '@/lib/db/drizzle'
import { emailHtml, emailText, type EmailContent } from '@/lib/email/layout'
import { siteUrl } from '@/lib/site-url'
import { collectEnabled } from '@/lib/switches'

import { quietHours, shouldAlert, staleAfterHours, staleAlertsOn } from './rules'

export type StaleCheck =
  | { status: 'off' }
  | { status: 'fresh' | 'empty'; lastApprovedAt: string | null }
  | { status: 'alerted'; lastApprovedAt: string; quietHours: number; to: number }

/** When the newest story first went on the site (its `approvedAt`). */
async function lastApproved(payload: Payload): Promise<Date | null> {
  const { docs } = await payload.find({
    collection: 'stories',
    where: { and: [{ status: { equals: 'published' } }, { approvedAt: { exists: true } }] },
    sort: '-approvedAt',
    limit: 1,
    depth: 0,
    select: { approvedAt: true },
    overrideAccess: true,
  })
  const value = docs[0]?.approvedAt
  return value ? new Date(value) : null
}

export function staleEmail(input: { lastApprovedAt: Date; hours: number; collecting: boolean; adminUrl: string }): EmailContent {
  return {
    locale: 'zh-Hans',
    heading: `日报已经 ${input.hours} 小时没有新发布`,
    paragraphs: [
      `最近一条新闻上线于 ${input.lastApprovedAt.toISOString().replace('T', ' ').slice(0, 16)}（UTC）。之后没有新的新闻通过审核。`,
      input.collecting
        ? '站内采集是开着的。可以看看审核队列里有没有积压，或者 Inngest 里采集、判断、写作任务有没有失败。'
        : '站内采集是关着的（COLLECT_ENABLED），新闻只靠本机流水线导入。看看导入脚本是不是停了，或者 STORY_IMPORT_TOKEN 是否还对得上。',
      '恢复发布之前，这封提醒每天发一次。',
    ],
    button: { label: '打开审核队列', href: input.adminUrl },
    footer: '这封邮件发给所有后台管理员。不想收可以在 Vercel 设 DAILY_STALE_ALERT=off。',
  }
}

/** The job's one step: look at the newest story and email every admin if the daily has gone quiet. */
export async function checkStale(now = new Date()): Promise<StaleCheck> {
  if (!staleAlertsOn()) return { status: 'off' }
  const { payload } = await getDb()
  const last = await lastApproved(payload)
  if (!last) return { status: 'empty', lastApprovedAt: null }
  if (!shouldAlert(last, now, staleAfterHours())) return { status: 'fresh', lastApprovedAt: last.toISOString() }

  const { docs } = await payload.find({ collection: 'admins', depth: 0, pagination: false, overrideAccess: true })
  const to = [...new Set(docs.map((doc) => doc.email.trim().toLowerCase()).filter(Boolean))]
  const hours = quietHours(last, now)
  const content = staleEmail({ lastApprovedAt: last, hours, collecting: collectEnabled(), adminUrl: `${siteUrl()}/admin/collections/stories/review` })
  for (const address of to) {
    await payload.sendEmail({ to: address, subject: content.heading, html: emailHtml(content), text: emailText(content) })
  }
  return { status: 'alerted', lastApprovedAt: last.toISOString(), quietHours: hours, to: to.length }
}
