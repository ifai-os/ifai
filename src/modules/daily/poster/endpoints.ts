import type { Endpoint } from 'payload'

import { shanghaiDate } from '@/lib/shanghai-day'

import { ReviewError } from '../review/actions'
import { handle } from '../review/handler'
import { arrangePoster, generatePoster, loadPosterDesk } from './desk'
import { isPosterDate } from './rules'

/** The day asked for, today in Shanghai when none is given. */
function dateOf(value: unknown): string {
  if (value === undefined || value === null || value === '') return shanghaiDate()
  if (!isPosterDate(value)) throw new ReviewError('bad_request', 400, { issues: ['date'] })
  return value
}

function itemsOf(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((id) => Number.isInteger(id))) throw new ReviewError('bad_request', 400, { issues: ['items'] })
  return value as number[]
}

/**
 * The review screen's「今日海报」column on the posters collection (all need a signed-in admin):
 *   GET  /api/posters/desk?date=YYYY-MM-DD   a day's poster and published stories (default today, Shanghai)
 *   POST /api/posters/desk/arrange            { date?, items } the editor's list, in order
 *   POST /api/posters/desk/generate           { date? } freeze the content and render the five images
 * Each answers with the day's poster as the column shows it (./types.ts).
 */
export const posterEndpoints: Endpoint[] = [
  { path: '/desk', method: 'get', handler: handle((req) => loadPosterDesk(req.payload, dateOf(req.searchParams?.get('date')))) },
  { path: '/desk/arrange', method: 'post', handler: handle((req, body) => arrangePoster(req.payload, dateOf(body.date), itemsOf(body.items))) },
  { path: '/desk/generate', method: 'post', handler: handle((req, body) => generatePoster(req.payload, dateOf(body.date))) },
]
