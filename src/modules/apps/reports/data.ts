import type { Payload } from 'payload'

import { shanghaiDayStart } from '@/lib/shanghai-day'

import { reportRules, type AppReportInput } from './rules'

/**
 * Writing readers' reports for the API (src/app/api/app-reports/new). Works on the Payload
 * instance it is given and stays free of the Payload config, like ./admin.
 */

export type SubmitResult = 'reported' | 'not-found' | 'daily-limit'

/**
 * Records a report about a published app. `reporter` is `u:<member id>` or `v:<the day's visitor
 * hash>`; each sends at most `dailyLimit` reports a Shanghai day.
 */
export async function submitReport(payload: Payload, report: AppReportInput & { reporter: string }, now = new Date()): Promise<SubmitResult> {
  // Readers see only published apps; without a user, access control leaves the others out.
  const { totalDocs: published } = await payload.count({ collection: 'apps', where: { id: { equals: report.app } }, overrideAccess: false })
  if (published === 0) return 'not-found'
  const { totalDocs: today } = await payload.count({
    collection: 'app-reports',
    where: { reporter: { equals: report.reporter }, createdAt: { greater_than_equal: shanghaiDayStart(now).toISOString() } },
  })
  if (today >= reportRules.dailyLimit) return 'daily-limit'
  await payload.create({
    collection: 'app-reports',
    data: {
      app: report.app,
      kind: report.kind,
      body: report.body || null,
      contact: report.contact || null,
      pageLocale: report.locale,
      reporter: report.reporter,
      status: 'open',
    },
  })
  return 'reported'
}
