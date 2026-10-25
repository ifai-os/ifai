import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { findByHandle } from './data'
import type { MemberReportReason } from './rules'
import { memberReports } from './schema'

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export type MemberReportResult = 'reported' | 'not-found' | 'own-profile'

/**
 * Records a reader's report of the member at `handle` (docs/specs/circles.md rule 24; one they
 * had before also works), once per reporter: `u:<member id>` or the day's visitor hash `v:…`.
 * Nobody reports themselves. Nothing changes until the site owner looks (./admin.ts).
 */
export async function reportMember(
  payload: Payload,
  report: { handle: string; reason: MemberReportReason; reporter: string; userId: string | null },
): Promise<MemberReportResult> {
  const member = await findByHandle(payload, report.handle)
  if (!member) return 'not-found'
  if (member.userId === report.userId) return 'own-profile'
  await drizzleOf(payload)
    .insert(memberReports)
    .values({ userId: member.userId, reporter: report.reporter, reason: report.reason })
    .onConflictDoNothing()
  return 'reported'
}
