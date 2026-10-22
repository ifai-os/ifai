import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'
import { siteUrl } from '@/lib/site-url'

import { runImport } from './import'

/**
 * `skill/import` {skillId, ref?, version?}: sent by the「导入版本」button (POST /api/skills/:id/import).
 * Everything happens in one step: the snapshot is too large to pass between steps, and the
 * outcome is recorded on the Skill itself. No automatic retry: the owner re-runs it.
 */
export const importSkill = inngest.createFunction(
  { id: 'skill-import', triggers: [{ event: 'skill/import' }], concurrency: 2, retries: 0 },
  async ({ event, step }) => {
    const skillId = Number(event.data.skillId)
    if (!Number.isInteger(skillId)) return { outcome: 'failed', message: `Bad skillId: ${String(event.data.skillId)}` }
    const ref = typeof event.data.ref === 'string' && event.data.ref ? event.data.ref : undefined
    const version = typeof event.data.version === 'string' && event.data.version ? event.data.version : undefined
    return step.run('import', async () => {
      const { payload } = await getDb()
      return runImport({ skillId, ref, version }, { payload, token: process.env.GITHUB_TOKEN, userAgent: `IFAIBot/0.1 (+${siteUrl()})` })
    })
  },
)

export const resourcesFunctions = [importSkill]
