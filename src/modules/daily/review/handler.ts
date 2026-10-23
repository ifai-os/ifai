import type { Endpoint, PayloadRequest } from 'payload'

import { ReviewError } from './actions'

export type Body = Record<string, unknown>

async function bodyOf(req: PayloadRequest): Promise<Body> {
  try {
    const data = await req.json?.()
    return data && typeof data === 'object' ? (data as Body) : {}
  } catch {
    return {}
  }
}

/**
 * Wraps an endpoint of the review screen: a signed-in admin only, the JSON body read for POST,
 * null answered as 404, and a ReviewError as its status with the code the screen explains.
 */
export function handle(run: (req: PayloadRequest, body: Body) => Promise<unknown>): Endpoint['handler'] {
  return async (req) => {
    if (!req.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
    try {
      const body = req.method?.toUpperCase() === 'POST' ? await bodyOf(req) : {}
      const result = await run(req, body)
      return result === null ? Response.json({ error: 'not_found' }, { status: 404 }) : Response.json(result)
    } catch (error) {
      if (error instanceof ReviewError) return Response.json({ error: error.code, detail: error.detail }, { status: error.status })
      console.error('review endpoint failed:', error)
      return Response.json({ error: 'failed', message: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
  }
}
