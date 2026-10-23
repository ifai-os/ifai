import type { Endpoint, PayloadRequest } from 'payload'

import { parseId } from '../reviews/rules'
import { draftFromSubmission, handlingState, markDuplicate, type HandlingResult, type HandlingState } from './admin'

export type HandlingResponse = HandlingState
export type HandlingActionResponse = HandlingResult

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

async function actionOf(req: PayloadRequest): Promise<unknown> {
  try {
    const body: unknown = await req.json?.()
    return body && typeof body === 'object' ? (body as Record<string, unknown>).action : undefined
  } catch {
    return undefined
  }
}

const statusFor: Record<Exclude<HandlingResult, { ok: true }>['error'], number> = {
  'not-found': 404,
  decided: 409,
  listed: 409,
  'not-listed': 409,
  invalid: 422,
}

/** Back-office endpoints on `app-submissions`, for admins only: the「处理」panel. */
export const submissionEndpoints: Endpoint[] = [
  {
    // GET /api/app-submissions/:id/handling — the linked app and the apps on the same domain.
    path: '/:id/handling',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const id = parseId(req.routeParams?.id)
      if (!id) return Response.json({ error: 'Bad id' }, { status: 400 })
      const state = await handlingState(req.payload, id)
      if (!state) return Response.json({ error: 'Not found' }, { status: 404 })
      const response: HandlingResponse = state
      return Response.json(response)
    },
  },
  {
    // POST /api/app-submissions/:id/handling { action: 'draft' } (「收录：生成草稿」) or { action: 'duplicate' } (「标为重复」).
    path: '/:id/handling',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const id = parseId(req.routeParams?.id)
      if (!id) return Response.json({ error: 'Bad id' }, { status: 400 })
      const action = await actionOf(req)
      if (action !== 'draft' && action !== 'duplicate') {
        return Response.json({ error: 'Send JSON: { "action": "draft" } or { "action": "duplicate" }' }, { status: 400 })
      }
      const result: HandlingActionResponse = action === 'draft' ? await draftFromSubmission(req, id) : await markDuplicate(req, id)
      return Response.json(result, { status: result.ok ? 200 : statusFor[result.error] })
    },
  },
]
