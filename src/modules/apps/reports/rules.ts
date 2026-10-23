import { isLocale, type Locale } from '@/i18n/config'

import { cleanLine, cleanText, parseId, textLength } from '../reviews/rules'

/**
 * Reports about an app's page (docs/specs/apps.md 5d,「信息有误？」): the kinds, limits, input
 * checks and shapes shared by the API, the detail page and the back office. No server imports,
 * so the page's own code can use it.
 */
export const reportRules = {
  /** Characters (code points) in the details. */
  maxBody: 1000,
  /** Characters in the optional line saying how to reach the reader. */
  maxContact: 200,
  /** Reports one reader can send per Shanghai day: a member by account, a visitor by the day's visitor hash. */
  dailyLimit: 10,
} as const

export const reportKinds = ['wrong-info', 'shut-down', 'other'] as const
export type ReportKind = (typeof reportKinds)[number]

export const reportStatuses = ['open', 'resolved'] as const
export type ReportStatus = (typeof reportStatuses)[number]

/** Details are needed, except for a site that is gone: that says it all. */
export function needsBody(kind: ReportKind): boolean {
  return kind !== 'shut-down'
}

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === 'string' && (reportKinds as readonly string[]).includes(value)
}

export type AppReportInput = { app: number; kind: ReportKind; body: string; contact: string; locale: Locale }

export type AppReportInputError = 'invalid-app' | 'invalid-kind' | 'empty-body' | 'body-too-long' | 'contact-too-long' | 'invalid-locale'

/**
 * POST /api/app-reports/new { app, kind, body, contact, locale }. The details keep their line
 * breaks, as reviews do; the contact is one line. The locale is the page the reader was on, so
 * the site owner knows which language's text they mean.
 */
export function parseAppReportInput(input: unknown): { ok: true; value: AppReportInput } | { ok: false; error: AppReportInputError } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const app = parseId(fields.app)
  if (!app) return { ok: false, error: 'invalid-app' }
  const kind = fields.kind
  if (!isReportKind(kind)) return { ok: false, error: 'invalid-kind' }
  const body = typeof fields.body === 'string' ? cleanText(fields.body) : ''
  if (!body && needsBody(kind)) return { ok: false, error: 'empty-body' }
  if (textLength(body) > reportRules.maxBody) return { ok: false, error: 'body-too-long' }
  const contact = typeof fields.contact === 'string' ? cleanLine(fields.contact) : ''
  if (textLength(contact) > reportRules.maxContact) return { ok: false, error: 'contact-too-long' }
  if (!isLocale(fields.locale)) return { ok: false, error: 'invalid-locale' }
  return { ok: true, value: { app, kind, body, contact, locale: fields.locale } }
}

export type AppReportsError = AppReportInputError | 'cross-site' | 'not-found' | 'daily-limit' | 'invalid-request'
