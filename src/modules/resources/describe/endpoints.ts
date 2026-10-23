import type { Endpoint } from 'payload'

import { inngest } from '@/lib/inngest/client'
import { errorMessage } from '@/modules/daily/collect/fetch'

import { describeEvent, requestDescribe, type DraftMode } from './state'

export type Queued = { ok: true } | { ok: false; error: string }

/** Hand drafts to the background job. If Inngest is unreachable they stay「待生成」for the sweep. */
export async function queueDescribe(versionIds: number[]): Promise<Queued> {
  if (versionIds.length === 0) return { ok: true }
  try {
    await inngest.send(versionIds.map((versionId) => ({ name: describeEvent, data: { versionId } })))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export type DescribeRequestResponse = { status: 'pending'; requestedAt: string; mode: DraftMode; queued: Queued }

/** Back-office endpoints on `skill-versions`, for admins only. */
export const describeEndpoints: Endpoint[] = [
  {
    // POST /api/skill-versions/:id/describe {mode?} — ask for a (new) description draft (the「生成说明草稿」button).
    path: '/:id/describe',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const id = Number(req.routeParams?.id)
      if (!Number.isInteger(id)) return Response.json({ error: 'Bad id' }, { status: 400 })
      let mode: DraftMode = 'rewrite'
      try {
        const body = ((await req.json?.()) ?? {}) as { mode?: unknown }
        if (body.mode === 'fill') mode = 'fill'
      } catch {
        // No JSON body: rewrite.
      }
      const info = await requestDescribe(req.payload, id, { mode })
      if (!info?.requestedAt) return Response.json({ error: 'Not found' }, { status: 404 })
      const response: DescribeRequestResponse = { status: 'pending', requestedAt: info.requestedAt, mode, queued: await queueDescribe([id]) }
      return Response.json(response)
    },
  },
]
