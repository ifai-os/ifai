import type { Endpoint, PayloadRequest } from 'payload'

import { parseId } from '../reviews/rules'
import { adminReports, appStatus, delistApp, openReportsByApp, resolveReports, type AdminReport, type OpenAppReports } from './admin'

export type AppReportsResponse = { appStatus: 'draft' | 'published' | 'delisted' | null; reports: AdminReport[] }
export type OpenAppReportsResponse = OpenAppReports

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

async function jsonOf(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json?.()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Back-office endpoints for readers' reports (`app-reports`) on `apps`, for admins only. */
export const reportEndpoints: Endpoint[] = [
  {
    // GET /api/apps/reports — apps with reports nobody has dealt with, for the notice above the apps list.
    path: '/reports',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const response: OpenAppReportsResponse = await openReportsByApp(req.payload)
      return Response.json(response)
    },
  },
  {
    // GET /api/apps/:id/reports — every report about the app, for its「报错」tab.
    path: '/:id/reports',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const appId = parseId(req.routeParams?.id)
      if (!appId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const [status, reports] = await Promise.all([appStatus(req.payload, appId), adminReports(req.payload, appId)])
      if (!status) return Response.json({ error: 'Not found' }, { status: 404 })
      const response: AppReportsResponse = { appStatus: status, reports }
      return Response.json(response)
    },
  },
  {
    // POST /api/apps/:id/reports { resolve: [ids] } or { resolve: 'all' } (「标记完成」), or { delist: true }
    // (「下架」: the app is delisted and its open reports are marked done).
    path: '/:id/reports',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const appId = parseId(req.routeParams?.id)
      if (!appId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const body = await jsonOf(req)
      if (body.delist === true) {
        return (await delistApp(req, appId)) ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
      }
      const ids = Array.isArray(body.resolve) ? body.resolve.map(parseId) : null
      if (body.resolve !== 'all' && (!ids || ids.length === 0 || ids.some((id) => id === null))) {
        return Response.json({ error: 'Send JSON: { "resolve": [ids] }, { "resolve": "all" } or { "delist": true }' }, { status: 400 })
      }
      const resolved = await resolveReports(req, appId, body.resolve === 'all' ? 'all' : (ids as number[]))
      return Response.json({ ok: true, resolved })
    },
  },
]
