import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'
import { siteUrl } from '@/lib/site-url'

import { describeFunctions } from '../describe/jobs'
import { describeEvent } from '../describe/state'
import { statsFunctions } from '../stats/jobs'
import { submitFunctions } from '../submit/jobs'
import { runImport } from './import'

/**
 * `skill/import` {skillId, ref?, version?}: sent by the「导入版本」button (POST /api/skills/:id/import).
 * The import is one step: the snapshot is too large to pass between steps, and the outcome is
 * recorded on the Skill itself. No automatic retry: the owner re-runs it. A Skill that has no
 * description yet then gets one drafted (`skill/describe`, ../describe/jobs.ts).
 */
export const importSkill = inngest.createFunction(
  { id: 'skill-import', triggers: [{ event: 'skill/import' }], concurrency: 2, retries: 0 },
  async ({ event, step }) => {
    const skillId = Number(event.data.skillId)
    if (!Number.isInteger(skillId)) return { outcome: 'failed', message: `Bad skillId: ${String(event.data.skillId)}` }
    const ref = typeof event.data.ref === 'string' && event.data.ref ? event.data.ref : undefined
    const version = typeof event.data.version === 'string' && event.data.version ? event.data.version : undefined
    const result = await step.run('import', async () => {
      const { payload } = await getDb()
      return runImport({ skillId, ref, version }, { payload, token: process.env.GITHUB_TOKEN, userAgent: `IFAIBot/0.1 (+${siteUrl()})` })
    })
    if (result.outcome === 'created' && result.draftRequested) {
      await step.sendEvent('describe', { name: describeEvent, data: { versionId: result.versionId } })
    }
    return result
  },
)

export const resourcesFunctions = [importSkill, ...describeFunctions, ...statsFunctions, ...submitFunctions]
