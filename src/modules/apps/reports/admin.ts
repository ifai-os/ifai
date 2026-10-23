import type { Payload, PayloadRequest, Where } from 'payload'

import { isLocale, type Locale } from '@/i18n/config'
import { detectLanguage } from '@/lib/i18n/detect'
import type { App, AppReport } from '@/payload-types'

import type { ReportKind, ReportStatus } from './rules'

/**
 * What the back office reads and changes about reports: an app's reports, marking them done,
 * delisting an app that has shut down, and the apps with reports nobody has dealt with yet. Free
 * of the Payload config, so the collection (through ./endpoints) can import it.
 */

export type AdminReport = {
  id: number
  kind: ReportKind
  body: string
  /** The language the details are written in, for their `lang`. */
  lang: string
  contact: string
  /** The page the reader was on, so the owner knows which language's text they mean. */
  locale: Locale | null
  from: 'member' | 'visitor'
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
}

export type OpenAppReports = {
  /** Open reports, over every app. */
  total: number
  /** Apps with open reports (among the newest 500 of them). */
  appCount: number
  /** The first few of those apps, the most recently reported first. */
  apps: { id: number; name: string; kinds: Partial<Record<ReportKind, number>> }[]
}

function toAdminReport(doc: AppReport): AdminReport {
  const locale = isLocale(doc.pageLocale) ? doc.pageLocale : null
  return {
    id: doc.id,
    kind: doc.kind,
    body: doc.body ?? '',
    lang: detectLanguage(doc.body ?? '', locale ?? 'en'),
    contact: doc.contact ?? '',
    locale,
    from: doc.reporter.startsWith('u:') ? 'member' : 'visitor',
    status: doc.status,
    createdAt: doc.createdAt,
    resolvedAt: doc.resolvedAt ?? null,
  }
}

/** The app's status, for whether「下架」applies; null when there is no such app. */
export async function appStatus(payload: Payload, appId: number): Promise<App['status'] | null> {
  const { docs } = await payload.find({ collection: 'apps', where: { id: { equals: appId } }, limit: 1, depth: 0, select: { status: true } })
  return docs[0]?.status ?? null
}

/** An app's reports: the ones nobody has dealt with first, newest first within each. */
export async function adminReports(payload: Payload, appId: number, limit = 200): Promise<AdminReport[]> {
  const { docs } = await payload.find({ collection: 'app-reports', where: { app: { equals: appId } }, sort: '-createdAt', limit, depth: 0 })
  const reports = docs.map(toAdminReport)
  return [...reports.filter((report) => report.status === 'open'), ...reports.filter((report) => report.status !== 'open')]
}

/** Marks the app's open reports done: the ones given, or all of them. Returns how many changed. */
export async function resolveReports(req: PayloadRequest, appId: number, ids: number[] | 'all'): Promise<number> {
  const where: Where = {
    and: [{ app: { equals: appId } }, { status: { equals: 'open' } }, ...(ids === 'all' ? [] : [{ id: { in: ids } }])],
  }
  const { docs } = await req.payload.update({ collection: 'app-reports', where, data: { status: 'resolved' }, depth: 0, req })
  return docs.length
}

/** 「下架」: the app leaves the site and its open reports are marked done. False when there is no such app. */
export async function delistApp(req: PayloadRequest, appId: number): Promise<boolean> {
  const status = await appStatus(req.payload, appId)
  if (!status) return false
  if (status !== 'delisted') await req.payload.update({ collection: 'apps', id: appId, data: { status: 'delisted' }, depth: 0, req })
  await resolveReports(req, appId, 'all')
  return true
}

/** Deletes an app's reports along with the app (a Payload hook on `apps`). */
export async function deleteAppReports(req: PayloadRequest, appId: number | string): Promise<void> {
  await req.payload.delete({ collection: 'app-reports', where: { app: { equals: appId } }, req })
}

/** Apps with reports nobody has dealt with, for the notice above the apps list. */
export async function openReportsByApp(payload: Payload, limit = 10): Promise<OpenAppReports> {
  const { docs, totalDocs } = await payload.find({
    collection: 'app-reports',
    where: { status: { equals: 'open' } },
    sort: '-createdAt',
    limit: 500,
    depth: 1,
    select: { app: true, kind: true },
    populate: { apps: { name: true } },
  })
  const apps = new Map<number, OpenAppReports['apps'][number]>()
  for (const doc of docs) {
    const id = typeof doc.app === 'object' ? doc.app.id : doc.app
    const entry = apps.get(id) ?? { id, name: typeof doc.app === 'object' ? doc.app.name : `#${id}`, kinds: {} }
    entry.kinds[doc.kind] = (entry.kinds[doc.kind] ?? 0) + 1
    apps.set(id, entry)
  }
  return { total: totalDocs, appCount: apps.size, apps: [...apps.values()].slice(0, limit) }
}
