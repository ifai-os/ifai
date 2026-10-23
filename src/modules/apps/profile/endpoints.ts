import type { Endpoint } from 'payload'

import { inngest } from '@/lib/inngest/client'
import { errorMessage } from '@/modules/daily/collect/fetch'

import { importApps, parseImportList } from './import'
import { draftEvent, requestDraft } from './state'

export type Queued = { ok: true } | { ok: false; error: string }

/** Hand drafts to the background job. If Inngest is unreachable they stay「待生成」for the sweep. */
export async function queueDrafts(appIds: number[]): Promise<Queued> {
  if (appIds.length === 0) return { ok: true }
  try {
    await inngest.send(appIds.map((appId) => ({ name: draftEvent, data: { appId } })))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export type DraftRequestResponse = { status: 'pending'; requestedAt: string; queued: Queued }
export type ImportResponse = Awaited<ReturnType<typeof importApps>> & { queued: Queued }

/** Back-office endpoints on `apps`, for admins only. */
export const draftEndpoints: Endpoint[] = [
  {
    // POST /api/apps/:id/draft — ask for a new profile draft (the「生成草稿」button).
    path: '/:id/draft',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const id = Number(req.routeParams?.id)
      if (!Number.isInteger(id)) return Response.json({ error: 'Bad id' }, { status: 400 })
      const info = await requestDraft(req.payload, id)
      if (!info?.requestedAt) return Response.json({ error: 'Not found' }, { status: 404 })
      const response: DraftRequestResponse = { status: 'pending', requestedAt: info.requestedAt, queued: await queueDrafts([id]) }
      return Response.json(response)
    },
  },
  {
    // POST /api/apps/import-websites { text } — the batch import on the apps list: one app per line.
    path: '/import-websites',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      let text = ''
      try {
        const body = (await req.json?.()) as { text?: unknown } | undefined
        if (typeof body?.text === 'string') text = body.text
      } catch {
        return Response.json({ error: 'Send JSON: { "text": "…" }' }, { status: 400 })
      }
      const { entries, problems } = parseImportList(text)
      const result = await importApps(req.payload, entries)
      const response: ImportResponse = {
        ...result,
        problems: [...problems, ...result.problems].sort((a, b) => a.line - b.line),
        queued: await queueDrafts(result.created.map((app) => app.id)),
      }
      return Response.json(response)
    },
  },
]
