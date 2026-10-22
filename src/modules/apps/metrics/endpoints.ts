import type { Endpoint, PayloadRequest } from 'payload'

import { inngest } from '@/lib/inngest/client'
import { shanghaiDate } from '@/lib/shanghai-day'
import { errorMessage } from '@/modules/daily/collect/fetch'

import { appHeatRows, heatEvent, heatRuns, listAppMentions, setMentionRemoved, type AppMentionRow, type HeatRow, type HeatRun } from './admin'
import { addDays } from './days'

/** A row as the browser gets it from Response.json: dates become ISO strings. */
export type AsJson<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] }
const asJson = <T>(value: T) => value as unknown as AsJson<T>

export type HeatStatusResponse = { latest: AsJson<HeatRun> | null; lastDone: AsJson<HeatRun> | null }
export type HeatRunResponse = { queued: true } | { queued: false; error: string }
export type AppHeatResponse = {
  latest: AsJson<HeatRow> | null
  /** Heat per day over the last 30 days, oldest first. */
  history: { day: string; heat: number }[]
  mentions: AppMentionRow[]
}

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

function appIdOf(req: PayloadRequest): number | null {
  const id = Number(req.routeParams?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Back-office endpoints for heat on `apps`, for admins only. */
export const heatEndpoints: Endpoint[] = [
  {
    // GET /api/apps/heat-status — the last heat run, for the notice above the apps list.
    path: '/heat-status',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const { latest, lastDone } = await heatRuns(req.payload)
      const response: HeatStatusResponse = { latest: latest && asJson(latest), lastDone: lastDone && asJson(lastDone) }
      return Response.json(response)
    },
  },
  {
    // POST /api/apps/heat-run — run the heat job now (the「现在重算」button).
    path: '/heat-run',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      let response: HeatRunResponse
      try {
        await inngest.send({ name: heatEvent, data: {} })
        response = { queued: true }
      } catch (error) {
        response = { queued: false, error: errorMessage(error) }
      }
      return Response.json(response)
    },
  },
  {
    // GET /api/apps/:id/heat — one app's latest heat, its last 30 days and its matched stories.
    path: '/:id/heat',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const appId = appIdOf(req)
      if (!appId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const rows = await appHeatRows(req.payload, appId, addDays(shanghaiDate(), -30))
      const response: AppHeatResponse = {
        latest: rows[0] ? asJson(rows[0]) : null,
        history: rows.map((row) => ({ day: row.day, heat: row.heat })).reverse(),
        mentions: await listAppMentions(req.payload, appId, req.i18n?.language === 'en' ? 'en' : 'zh-Hans'),
      }
      return Response.json(response)
    },
  },
  {
    // POST /api/apps/:id/mentions/:mentionId { removed: boolean } — a wrong match, or take that back.
    path: '/:id/mentions/:mentionId',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const appId = appIdOf(req)
      const mentionId = Number(req.routeParams?.mentionId)
      if (!appId || !Number.isInteger(mentionId)) return Response.json({ error: 'Bad id' }, { status: 400 })
      let removed: unknown
      try {
        removed = ((await req.json?.()) as { removed?: unknown } | undefined)?.removed
      } catch {
        removed = undefined
      }
      if (typeof removed !== 'boolean') return Response.json({ error: 'Send JSON: { "removed": true }' }, { status: 400 })
      const ok = await setMentionRemoved(req.payload, appId, mentionId, removed)
      return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
    },
  },
]
