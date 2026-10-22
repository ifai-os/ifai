import type { Payload } from 'payload'

import type { SkillVersion } from '@/payload-types'
import type { Verification } from '@/modules/daily/write/verify'

/**
 * A description draft's state, kept on the version it is written from: `draftStatus`
 * (pending → drafted | failed) and `draftInfo`. Only the background job and the back-office
 * endpoint write them. The text itself lands on the Skill (four languages, zh-Hant by hook) and
 * the declarations on the version. This file stays free of the Payload config and the model
 * client, so the collection can import it.
 */

export const describeEvent = 'skill/describe'

export type DraftStatus = NonNullable<SkillVersion['draftStatus']>

/** `fill` writes only what the owner left empty (the first import); `rewrite` replaces the text (the button). */
export type DraftMode = 'fill' | 'rewrite'

/** Why a draft is waiting or did not get written. The admin panel words each code. */
export type DraftReasonCode = 'switch-off' | 'budget' | 'no-key' | 'thin' | 'model' | 'error'
export type DraftReason = { code: DraftReasonCode; detail: string }

/** A declaration the model suggested but the files do not contain, so it was left out. */
export type DroppedDeclaration = { field: 'domains' | 'tools' | 'apiKeys'; value: string }

export type DraftInfo = {
  requestedAt?: string
  mode?: DraftMode
  reason?: DraftReason
  generatedAt?: string
  models?: string[]
  promptVersions?: string[]
  /** Locales whose text was written; in fill mode a locale the owner already filled is skipped. */
  wrote?: string[]
  /** False when the version was already published, so its declarations were left as they were (rule 2). */
  declarations?: boolean
  check?: Verification & { dropped: DroppedDeclaration[] }
}

export function infoOf(version: Pick<SkillVersion, 'draftInfo'>): DraftInfo {
  const info = version.draftInfo
  return info && typeof info === 'object' && !Array.isArray(info) ? (info as DraftInfo) : {}
}

/** Ask for a (new) draft: the version waits as「待生成」until the job writes it. Null when there is no such version. */
export async function requestDescribe(
  payload: Payload,
  versionId: number,
  { mode = 'rewrite', now = new Date() }: { mode?: DraftMode; now?: Date } = {},
): Promise<DraftInfo | null> {
  try {
    await payload.findByID({ collection: 'skill-versions', id: versionId, depth: 0 })
  } catch {
    return null
  }
  const info: DraftInfo = { requestedAt: now.toISOString(), mode }
  await payload.update({
    collection: 'skill-versions',
    id: versionId,
    data: { draftStatus: 'pending', draftInfo: info },
    depth: 0,
    context: { system: true },
  })
  return info
}
