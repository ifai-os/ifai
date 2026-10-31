import type { Endpoint, PayloadRequest } from 'payload'

import { inngest } from '@/lib/inngest/client'

import { answerProgress, retryAnswers, snapshotStatus, type AdminLocale, type AnswerProgress, type SnapshotStatusRow } from './admin'
import { answersEvent, externalImportEvent, snapshotEvent } from './events'
import { externalStatus, type ExternalStatus } from './external/admin'

export type SnapshotStatusResponse = { arenas: SnapshotStatusRow[] }
export type QueuedResponse = { queued: true; retried?: number } | { queued: false; error: string; retried?: number }
export type AnswerProgressResponse = { arenas: AnswerProgress[] }
export type ExternalStatusResponse = ExternalStatus

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

const localeOf = (req: PayloadRequest): AdminLocale => (req.i18n?.language === 'en' ? 'en' : 'zh-Hans')

function modelIdOf(req: PayloadRequest): number | null {
  const id = Number(req.routeParams?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Sends a job event; a job server that cannot be reached is an answer, not a crash. */
async function queue(name: string, extra: { retried?: number } = {}): Promise<QueuedResponse> {
  try {
    await inngest.send({ name, data: {} })
    return { queued: true, ...extra }
  } catch (error) {
    return { queued: false, error: message(error), ...extra }
  }
}

/** Back-office endpoints on `arenas`, for admins only: the snapshots above the list. */
export const snapshotEndpoints: Endpoint[] = [
  {
    // GET /api/arenas/snapshot-status — each arena's latest snapshot and its counted votes now.
    path: '/snapshot-status',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const response: SnapshotStatusResponse = { arenas: await snapshotStatus(req.payload, localeOf(req)) }
      return Response.json(response)
    },
  },
  {
    // POST /api/arenas/snapshot-run — compute this week's snapshots now (the「现在重算」button).
    path: '/snapshot-run',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      return Response.json(await queue(snapshotEvent))
    },
  },
]

/** Back-office endpoints on `arenas`, for admins only: the outside leaderboards above the list (「外部榜单」). */
export const externalEndpoints: Endpoint[] = [
  {
    // GET /api/arenas/external-status — each outside board's newest day and how many days are stored.
    path: '/external-status',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const response: ExternalStatusResponse = await externalStatus()
      return Response.json(response)
    },
  },
  {
    // POST /api/arenas/external-run — sync the outside boards now (the「现在同步」button).
    path: '/external-run',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      return Response.json(await queue(externalImportEvent))
    },
  },
]

/** Back-office endpoints on `arena-models`, for admins only: the「回答」box. */
export const answerEndpoints: Endpoint[] = [
  {
    // GET /api/arena-models/:id/answers — the model's answers per arena.
    path: '/:id/answers',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const modelId = modelIdOf(req)
      if (!modelId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const response: AnswerProgressResponse = { arenas: await answerProgress(req.payload, modelId, localeOf(req)) }
      return Response.json(response)
    },
  },
  {
    // POST /api/arena-models/:id/generate — generate the missing answers now (「现在生成」).
    path: '/:id/generate',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      if (!modelIdOf(req)) return Response.json({ error: 'Bad id' }, { status: 400 })
      return Response.json(await queue(answersEvent))
    },
  },
  {
    // POST /api/arena-models/:id/retry-failed — failed and unusable answers again (「重新生成失败和不能用的」).
    path: '/:id/retry-failed',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const modelId = modelIdOf(req)
      if (!modelId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const retried = await retryAnswers(req.payload, modelId)
      return Response.json(retried ? await queue(answersEvent, { retried }) : { queued: true, retried })
    },
  },
]
