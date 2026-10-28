import { createHash, timingSafeEqual } from 'node:crypto'

import type { Endpoint, PayloadRequest } from 'payload'

import { MAX_IMPORT_STORIES, parseImport, type ImportStory } from './rules'

/** A signed-in admin, or the pipeline with `Authorization: Bearer $STORY_IMPORT_TOKEN`. */
export function importAllowed(req: Pick<PayloadRequest, 'user' | 'headers'>, env: Record<string, string | undefined> = process.env): boolean {
  if (req.user) return true
  const token = env.STORY_IMPORT_TOKEN?.trim()
  const given = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token || !given) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(given), digest(token))
}

/**
 * POST /api/stories/import: stories from the editors' pipeline (docs/specs/daily.md「从本地流水线导入」),
 * as JSON Lines or one JSON array, at most 200. Answers which were created or updated and which
 * lines failed and why; 400 when nothing in the body could be read.
 */
export const importEndpoint: Endpoint = {
  path: '/import',
  method: 'post',
  handler: async (req) => {
    if (!importAllowed(req)) return Response.json({ error: 'unauthorized' }, { status: 401 })
    const body = (await req.text?.()) ?? ''
    const lines = parseImport(body)
    if (!lines.length) return Response.json({ error: 'empty', message: 'No stories in the body.' }, { status: 400 })
    if (lines.length > MAX_IMPORT_STORIES) {
      return Response.json({ error: 'too_many', message: `At most ${MAX_IMPORT_STORIES} stories per request; got ${lines.length}.` }, { status: 413 })
    }
    const valid = lines.flatMap(({ line, parsed }) => (parsed.ok ? [{ line, story: parsed.story as ImportStory }] : []))
    const invalid = lines.flatMap(({ line, parsed }) => (parsed.ok ? [] : [{ line, recordId: null, error: parsed.error }]))
    // Loaded here: ./import reads the Payload config, which loads this file through the stories collection.
    const { importStories } = await import('./import')
    let result: Awaited<ReturnType<typeof importStories>> = { imported: [], failed: [] }
    try {
      if (valid.length) result = await importStories(valid)
    } catch (error) {
      console.error('[daily import] failed:', error)
      return Response.json({ error: 'failed', message: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
    const { imported, failed } = result
    const created = imported.filter((outcome) => outcome.action === 'created').length
    return Response.json(
      { created, updated: imported.length - created, stories: imported, failed: [...invalid, ...failed].sort((a, b) => a.line - b.line) },
      { status: imported.length ? 200 : 400 },
    )
  },
}
