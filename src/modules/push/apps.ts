import { getDb } from '@/lib/db/drizzle'
import { queueDrafts, type Queued } from '@/modules/apps/profile/endpoints'
import { importApps } from '@/modules/apps/profile/import'

import type { AppPush } from './rules'

export type AppResult = {
  kind: 'app'
  /** `created`: a new draft app waiting for its profile draft; `known`: an app on this domain exists. */
  action: 'created' | 'known'
  id: number
  name: string
  website: string
  queued?: Queued
}

/**
 * A pushed tool goes through the「批量添加应用」import as a one-line list: matched by domain against
 * every app (listed, draft or delisted), and a new one becomes a draft waiting for its profile draft.
 */
export async function pushApp(push: AppPush): Promise<AppResult> {
  const { payload } = await getDb()
  const result = await importApps(payload, [{ line: 1, name: push.name, website: push.website, domain: push.domain }])
  const existing = result.existing[0]
  if (existing) return { kind: 'app', action: 'known', id: existing.id, name: existing.name, website: existing.website }
  const created = result.created[0]
  if (!created) throw new Error(result.problems[0]?.detail ?? 'The app could not be saved.')
  return { kind: 'app', action: 'created', id: created.id, name: created.name, website: created.website, queued: await queueDrafts([created.id]) }
}
