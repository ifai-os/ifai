import { and, eq, inArray, lt, or, sql } from '@payloadcms/db-postgres/drizzle'
import { RetryAfterError } from 'inngest'
import type { Payload } from 'payload'

import { defaultLocale, isLocale } from '@/i18n/config'
import { getDb } from '@/lib/db/drizzle'
import { dailyEmailEnabled } from '@/lib/switches'

import { digestStories, type DigestStory } from './content'
import { deliveryConfigured, isDeployed, ResendError, sendBatch } from './delivery'
import { buildDigestEmail } from './digest'
import { recordFailure, recordQuota } from './resend-state'
import { dueDay, type DueDay } from './schedule'
import { emailSends, type EmailSendStatus } from './schema'

/**
 * The morning send (docs/specs/daily-email.md「定时任务」), step by step for ./jobs.ts: plan
 * (switch, Resend, who is due, the stories once), claim (an `email_sends` row per subscriber
 * and local date, the unique index stopping a second), then batches of up to 100 through
 * Resend with an idempotency key, and a stop when Resend says the quota is used up.
 */
type Env = Record<string, string | undefined>

/** Tries per email: a failed one goes again in a later run before 11:00 there, three times at most. */
export const MAX_ATTEMPTS = 3
/** A claim this old whose run never finished is someone else's to take over. */
const STALE_MS = 60 * 60 * 1000

export type ClaimRow = { status: EmailSendStatus; attempts: number; runId: string | null; updatedAt: Date }

/**
 * Whether a run may (re)claim an existing row: a failure with tries left, its own claim (a
 * retried step), or a claim abandoned for an hour. Anything sent is final. The claim's
 * `setWhere` below says the same in SQL.
 */
export function claimable(row: ClaimRow, runId: string | null, now: Date): boolean {
  if (row.status === 'failed') return row.attempts < MAX_ATTEMPTS
  if (row.status === 'sending') return (runId !== null && row.runId === runId) || now.getTime() - row.updatedAt.getTime() > STALE_MS
  return false
}

export function chunks<T>(list: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < list.length; index += size) result.push(list.slice(index, index + size))
  return result
}

type Due = { subscriberId: number; locale: string; localDate: string }

function dueDayOf(timeZone: string, now: Date): DueDay | null {
  try {
    return dueDay(timeZone, now)
  } catch {
    // Not a zone this runtime knows: nobody there is due.
    return null
  }
}

/** Rule 12: preview deployments share production's subscribers (a branch of its database), so they write only to admins. */
async function adminEmails(payload: Payload): Promise<Set<string>> {
  const { docs } = await payload.find({ collection: 'admins', depth: 0, pagination: false, overrideAccess: true })
  return new Set(docs.map((doc) => doc.email.trim().toLowerCase()))
}

/**
 * Who gets an email in this run: subscribed, between 8:00 and 11:00 where they are, subscribed
 * before that 8:00, and not sent that local date yet (unless the row may be claimed again).
 */
async function dueSubscribers(now: Date, env: Env, runId: string | null): Promise<Due[]> {
  const { payload, db } = await getDb()
  const zones = await db.execute<{ time_zone: string }>(sql`select distinct time_zone from subscribers where status = 'subscribed'`)
  const days = new Map<string, DueDay>()
  for (const { time_zone: timeZone } of zones.rows) {
    const day = dueDayOf(timeZone, now)
    if (day) days.set(timeZone, day)
  }
  if (!days.size) return []

  const { docs } = await payload.find({
    collection: 'subscribers',
    where: { and: [{ status: { equals: 'subscribed' } }, { timeZone: { in: [...days.keys()] } }] },
    select: { email: true, locale: true, timeZone: true, subscribedAt: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const admins = env.VERCEL_ENV === 'preview' ? await adminEmails(payload) : null
  const due = docs.flatMap((doc): Due[] => {
    const day = days.get(doc.timeZone)
    if (!day || (doc.subscribedAt && Date.parse(doc.subscribedAt) >= day.sendAt.getTime())) return []
    if (admins && !admins.has(doc.email)) return []
    return [{ subscriberId: doc.id, locale: doc.locale, localDate: day.localDate }]
  })
  if (!due.length) return []

  const rows = await db
    .select({
      subscriberId: emailSends.subscriberId,
      localDate: emailSends.localDate,
      status: emailSends.status,
      attempts: emailSends.attempts,
      runId: emailSends.runId,
      updatedAt: emailSends.updatedAt,
    })
    .from(emailSends)
    .where(
      and(
        inArray(
          emailSends.subscriberId,
          due.map((item) => item.subscriberId),
        ),
        inArray(emailSends.localDate, [...new Set(due.map((item) => item.localDate))]),
      ),
    )
  const taken = new Set(rows.filter((row) => !claimable(row, runId, now)).map((row) => `${row.subscriberId}/${row.localDate}`))
  return due.filter((item) => !taken.has(`${item.subscriberId}/${item.localDate}`))
}

export type RunPlan =
  | { status: 'off' | 'not_configured' | 'none_due' | 'no_stories' }
  | {
      status: 'ready'
      /** The run's moment: who is due and which stories, however long the batches take. */
      now: string
      stories: DigestStory[]
    }

/** Whether this run sends, and what: the switch, Resend on Vercel, someone due, a story to send. */
export async function planRun(now: Date, env: Env = process.env): Promise<RunPlan> {
  if (!dailyEmailEnabled(env)) return { status: 'off' }
  if (isDeployed(env) && !deliveryConfigured(env)) return { status: 'not_configured' }
  if (!(await dueSubscribers(now, env, null)).length) return { status: 'none_due' }
  const stories = await digestStories((await getDb()).payload, now)
  if (!stories.length) return { status: 'no_stories' }
  return { status: 'ready', now: now.toISOString(), stories }
}

/** Writes this run's rows ("sending") and returns their ids, lowest first. Running it again in the same run returns the same rows. */
export async function claimDue(plan: { now: string; stories: unknown[] }, runId: string, env: Env = process.env): Promise<number[]> {
  const now = new Date(plan.now)
  const due = await dueSubscribers(now, env, runId)
  if (!due.length) return []
  const { db } = await getDb()
  const stale = new Date(now.getTime() - STALE_MS)
  const ids: number[] = []
  for (const part of chunks(due, 1000)) {
    const rows = await db
      .insert(emailSends)
      .values(
        part.map((item) => ({
          subscriberId: item.subscriberId,
          localDate: item.localDate,
          locale: item.locale,
          status: 'sending' as const,
          storyCount: plan.stories.length,
          attempts: 1,
          runId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [emailSends.subscriberId, emailSends.localDate],
        set: {
          status: 'sending',
          locale: sql`excluded.locale`,
          storyCount: sql`excluded.story_count`,
          // A retried claim of the same run is not another try.
          attempts: sql`${emailSends.attempts} + case when ${emailSends.runId} = excluded.run_id then 0 else 1 end`,
          runId: sql`excluded.run_id`,
          resendId: null,
          error: null,
          sentAt: null,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: or(
          and(eq(emailSends.status, 'failed'), lt(emailSends.attempts, MAX_ATTEMPTS)),
          and(eq(emailSends.status, 'sending'), or(eq(emailSends.runId, runId), lt(emailSends.updatedAt, stale))),
        ),
      })
      .returning({ id: emailSends.id })
    ids.push(...rows.map((row) => row.id))
  }
  return ids.sort((a, b) => a - b)
}

/** Rows Resend took: "sent" with its id (a webhook may have got there first), and the subscribers' last email. */
async function markSent(sent: { id: number; subscriberId: number; resendId: string | null }[], at: Date): Promise<void> {
  if (!sent.length) return
  const { db } = await getDb()
  const values = sql.join(
    sent.map((row) => sql`(${row.id}::integer, ${row.resendId}::text)`),
    sql`, `,
  )
  await db.execute(sql`
    update email_sends set
      status = case when email_sends.status = 'sending' then 'sent' else email_sends.status end,
      resend_id = coalesce(email_sends.resend_id, v.resend_id),
      sent_at = coalesce(email_sends.sent_at, ${at}),
      updated_at = ${at}
    from (values ${values}) as v(id, resend_id)
    where email_sends.id = v.id`)
  const subscribers = sql.join(
    sent.map((row) => sql`${row.subscriberId}`),
    sql`, `,
  )
  await db.execute(sql`update subscribers set last_sent_at = ${at} where id in (${subscribers})`)
}

/**
 * Rows that did not go out: "failed" with Resend's words. A used-up quota gives the try back,
 * since the quota returns (the free plan's at 00:00 UTC, which is 9:00 in Tokyo and Seoul).
 */
async function failRows(where: { ids: number[] } | { runId: string }, error: string, refund: boolean, at: Date): Promise<number> {
  const { db } = await getDb()
  const match = 'ids' in where ? inArray(emailSends.id, where.ids) : eq(emailSends.runId, where.runId)
  const rows = await db
    .update(emailSends)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: at, ...(refund && { attempts: sql`greatest(${emailSends.attempts} - 1, 0)` }) })
    .where(and(match, eq(emailSends.status, 'sending')))
    .returning({ id: emailSends.id })
  return rows.length
}

export type BatchResult = {
  sent: number
  failed: number
  /** Resend will not take more this round: the quota is used up, or the key or domain was refused. */
  stop?: { kind: 'quota' | 'refused'; message: string }
}

/**
 * Sends one batch of claimed rows. The emails are built only from what the plan froze and the
 * rows, so a retry of this step sends the same request with the same key and Resend answers it
 * from the first try instead of sending twice. Whoever unsubscribed since the claim is left out.
 */
export async function sendClaimed(
  ids: number[],
  plan: { stories: DigestStory[] },
  idempotencyKey: string,
  env: Env = process.env,
): Promise<BatchResult> {
  const { payload, db } = await getDb()
  const rows = await db
    .select({ id: emailSends.id, subscriberId: emailSends.subscriberId, localDate: emailSends.localDate, locale: emailSends.locale })
    .from(emailSends)
    .where(inArray(emailSends.id, ids))
    .orderBy(emailSends.id)
  const subscriberIds = rows.flatMap((row) => (row.subscriberId === null ? [] : [row.subscriberId]))
  const { docs } = subscriberIds.length
    ? await payload.find({
        collection: 'subscribers',
        where: { id: { in: subscriberIds } },
        select: { email: true, status: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })
    : { docs: [] }
  const subscribers = new Map(docs.map((doc) => [doc.id, doc]))

  const going: { id: number; subscriberId: number; email: string; locale: string; localDate: string }[] = []
  const gone: number[] = []
  for (const row of rows) {
    const subscriber = row.subscriberId === null ? undefined : subscribers.get(row.subscriberId)
    if (subscriber?.status === 'subscribed' && row.subscriberId !== null) going.push({ ...row, subscriberId: row.subscriberId, email: subscriber.email })
    else gone.push(row.id)
  }
  if (gone.length) await db.delete(emailSends).where(and(inArray(emailSends.id, gone), eq(emailSends.status, 'sending')))
  if (!going.length) return { sent: 0, failed: 0 }

  const emails = await Promise.all(
    going.map((row) =>
      buildDigestEmail(
        { email: row.email, locale: isLocale(row.locale) ? row.locale : defaultLocale, subscriberId: row.subscriberId, sendId: row.id },
        row.localDate,
        plan.stories,
      ),
    ),
  )

  try {
    const result = await sendBatch(emails, idempotencyKey, env)
    const at = new Date()
    await markSent(
      going.map((row, index) => ({ id: row.id, subscriberId: row.subscriberId, resendId: result.ids[index] ?? null })),
      at,
    )
    await recordQuota(result.quota, at)
    return { sent: going.length, failed: 0 }
  } catch (error) {
    if (!(error instanceof ResendError)) throw error
    const at = new Date()
    await recordQuota(error.quota, at)
    switch (error.kind) {
      case 'quota':
      case 'refused':
        await recordFailure(error.message, at)
        return { sent: 0, failed: 0, stop: { kind: error.kind, message: error.message } }
      case 'rejected': {
        await recordFailure(error.message, at)
        const failed = await failRows({ ids: going.map((row) => row.id) }, error.message, false, at)
        return { sent: 0, failed }
      }
      case 'conflict':
        // An earlier try with this key got through (someone unsubscribed between the tries): those went out.
        await markSent(
          going.map((row) => ({ id: row.id, subscriberId: row.subscriberId, resendId: null })),
          at,
        )
        return { sent: going.length, failed: 0 }
      case 'busy':
        throw new RetryAfterError(error.message, (error.retryAfter ?? 30) * 1000, { cause: error })
      case 'retry':
        throw error
    }
  }
}

/** Ends a round Resend stopped: the run's rows not sent yet fail with its reason (tried again later). */
export async function stopRun(runId: string, stop: NonNullable<BatchResult['stop']>): Promise<number> {
  return failRows({ runId }, stop.message, stop.kind === 'quota', new Date())
}

/** The run failed after its retries (Resend or the database down): its unsent rows fail, to be tried by a later run. */
export async function abandonRun(runId: string, error: string): Promise<number> {
  const at = new Date()
  await recordFailure(error, at)
  return failRows({ runId }, error, false, at)
}
