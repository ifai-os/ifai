import type { Payload } from 'payload'

import type { App } from '@/payload-types'
import type { Verification } from '@/modules/daily/write/verify'

import type { DroppedFact } from './check'

/**
 * A profile draft's state, kept on the app: `draftStatus` (pending → drafted | failed) and
 * `draftInfo`. Only the background job and the back-office endpoints write them. This file
 * stays free of the Payload config and the model client, so the collection can import it.
 */

export const draftEvent = 'apps/profile.draft'

export type DraftStatus = NonNullable<App['draftStatus']>

/** Why a draft is waiting or did not get written. The admin panel words each code. */
export type DraftReasonCode = 'switch-off' | 'budget' | 'no-key' | 'fetch' | 'thin' | 'model' | 'error'
export type DraftReason = { code: DraftReasonCode; detail: string }

export type DraftInfo = {
  requestedAt?: string
  /** The batch import named the app after its domain; the draft may rename it from the website. */
  nameFromDomain?: boolean
  reason?: DraftReason
  generatedAt?: string
  models?: string[]
  promptVersions?: string[]
  material?: { url: string; title: string; description: string; pricingUrl: string | null; chars: number }
  check?: Verification & { dropped: DroppedFact[] }
  images?: { logo?: string; screenshot?: string }
}

export function infoOf(app: Pick<App, 'draftInfo'>): DraftInfo {
  const info = app.draftInfo
  return info && typeof info === 'object' && !Array.isArray(info) ? (info as DraftInfo) : {}
}

/** Ask for a (new) draft: the app waits as「待生成」until the job writes it. Null when there is no such app. */
export async function requestDraft(
  payload: Payload,
  appId: number,
  { nameFromDomain, now = new Date() }: { nameFromDomain?: boolean; now?: Date } = {},
): Promise<DraftInfo | null> {
  let app: App
  try {
    app = await payload.findByID({ collection: 'apps', id: appId, depth: 0 })
  } catch {
    return null
  }
  const keepName = nameFromDomain ?? infoOf(app).nameFromDomain
  const info: DraftInfo = { requestedAt: now.toISOString(), ...(keepName ? { nameFromDomain: true } : {}) }
  await payload.update({ collection: 'apps', id: appId, data: { draftStatus: 'pending', draftInfo: info }, depth: 0 })
  return info
}
