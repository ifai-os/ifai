import type { Endpoint, PayloadRequest } from 'payload'

import { handleMemberReports, openMemberReports, type OpenMemberReport } from './admin'
import { parseMemberReportAction } from './rules'

export type MemberReportsResponse = { total: number; members: OpenMemberReport[] }

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

async function jsonOf(req: PayloadRequest): Promise<unknown> {
  try {
    return await req.json?.()
  } catch {
    return null
  }
}

/**
 * Back-office endpoints for reported members (docs/specs/circles.md rule 24), for admins only.
 * They sit on the `circles` collection, whose list shows the reported members: members' pages
 * come with the circles, and the admin log records what is pressed there.
 */
export const memberReportEndpoints: Endpoint[] = [
  {
    // GET /api/circles/member-reports — members with reports nobody has dealt with, for the notice above the circles list.
    path: '/member-reports',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const response: MemberReportsResponse = await openMemberReports(req.payload)
      return Response.json(response)
    },
  },
  {
    // POST /api/circles/member-reports/:userId { clearProfile?, resetHandle?, resetName? } or { keep: true }.
    path: '/member-reports/:userId',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const userId = req.routeParams?.userId
      if (typeof userId !== 'string' || !userId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const action = parseMemberReportAction(await jsonOf(req))
      if (!action) {
        return Response.json({ error: 'Send JSON: any of { "clearProfile": true, "resetHandle": true, "resetName": true }, or { "keep": true }' }, { status: 400 })
      }
      const ok = await handleMemberReports(req.payload, userId, action)
      return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
    },
  },
]
