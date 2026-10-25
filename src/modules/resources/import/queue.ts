import type { PayloadRequest } from 'payload'

import { inngest } from '@/lib/inngest/client'

/**
 * Queue `skill/import` for a Skill and note it under「最近导入」. Throws when the event could not
 * be sent (Inngest not running or not configured); nothing is noted then.
 */
export async function queueImport(req: PayloadRequest, skillId: number, options: { ref?: string; version?: string } = {}): Promise<void> {
  const { ref, version } = options
  await inngest.send({ name: 'skill/import', data: { skillId, ref, version } })
  await req.payload.update({
    collection: 'skills',
    id: skillId,
    data: { lastImport: { status: 'queued', ref: ref ?? null, commit: null, message: null, at: new Date().toISOString() } },
    depth: 0,
    req,
    context: { system: true },
  })
}
