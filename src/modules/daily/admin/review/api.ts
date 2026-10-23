'use client'

/** Calls to the review endpoints (src/modules/daily/review/endpoints.ts) from the admin screen. */
import type { PosterDesk } from '../../poster/types'
import type { AssistKind, Edits, MergeResult, ReviewDetail, ReviewQueue } from '../../review/types'

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail: Record<string, unknown> = {},
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

async function call<T>(apiRoute: string, path: string, body?: unknown, collection = 'stories'): Promise<T> {
  const response = await fetch(`${apiRoute}/${collection}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: Record<string, unknown>; message?: string }
  if (!response.ok) throw new ApiError(data.error ?? 'failed', response.status, { ...data.detail, message: data.message })
  return data as T
}

export const reviewApi = (apiRoute: string) => ({
  queue: () => call<ReviewQueue>(apiRoute, '/review-queue'),
  retrySource: (sourceId: number) => call<{ ok: boolean }>(apiRoute, '/review-queue/retry-source', { sourceId }),
  detail: (id: number) => call<ReviewDetail>(apiRoute, `/${id}/review`),
  edit: (id: number, edits: Edits) => call<ReviewDetail>(apiRoute, `/${id}/review/edit`, { edits }),
  publish: (id: number, edits?: Edits) => call<ReviewDetail>(apiRoute, `/${id}/review/publish`, { edits }),
  correct: (id: number, edits?: Edits) => call<ReviewDetail>(apiRoute, `/${id}/review/correct`, { edits }),
  reject: (id: number) => call<ReviewDetail>(apiRoute, `/${id}/review/reject`, {}),
  later: (id: number, edits?: Edits) => call<ReviewDetail>(apiRoute, `/${id}/review/later`, { edits }),
  withdraw: (id: number) => call<ReviewDetail>(apiRoute, `/${id}/review/withdraw`, {}),
  keepSeparate: (id: number) => call<ReviewDetail>(apiRoute, `/${id}/review/keep-separate`, {}),
  merge: (id: number, into: number, edits?: Edits) => call<MergeResult>(apiRoute, `/${id}/review/merge`, { into, edits }),
  rewrite: (id: number, locales?: string[], edits?: Edits) => call<ReviewDetail>(apiRoute, `/${id}/review/rewrite`, { locales, edits }),
  assist: (id: number, kind: AssistKind, edits: Edits, avoid: string[]) => call<{ text: string }>(apiRoute, `/${id}/review/assist`, { kind, edits, avoid }),
  // The「今日海报」column (src/modules/daily/poster/endpoints.ts).
  arrangePoster: (date: string, items: number[]) => call<PosterDesk>(apiRoute, '/desk/arrange', { date, items }, 'posters'),
  generatePoster: (date: string) => call<PosterDesk>(apiRoute, '/desk/generate', { date }, 'posters'),
})

export type ReviewApi = ReturnType<typeof reviewApi>
