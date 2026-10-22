import { inngest } from '@/lib/inngest/client'
import { getDb } from '@/lib/db/drizzle'
import { collectEnabled } from '@/lib/switches'

import { collectSource, fetchContent } from './collect'
import { isDue } from './plan'

/**
 * Every 15 minutes (or on the event `daily/collect.run` from the Inngest dashboard):
 * find the enabled sources whose next fetch time has passed and fan out one fetch each.
 */
export const collectDueSources = inngest.createFunction(
  { id: 'daily-collect-due-sources', triggers: [{ cron: '*/15 * * * *' }, { event: 'daily/collect.run' }] },
  async ({ step }) => {
    if (!collectEnabled()) return { skipped: 'COLLECT_ENABLED is not "true"' }

    const due = await step.run('find-due-sources', async () => {
      const { payload } = await getDb()
      const now = new Date()
      const { docs } = await payload.find({
        collection: 'sources',
        where: { enabled: { equals: true } },
        limit: 200,
        pagination: false,
      })
      return docs.filter((source) => isDue(source, now)).map((source) => ({ id: source.id, name: source.name }))
    })

    if (due.length) {
      await step.sendEvent(
        'fan-out',
        due.map((source) => ({ name: 'daily/source.fetch', data: { sourceId: source.id } })),
      )
    }
    return { due: due.map((source) => source.name) }
  },
)

/** One source: fetch, read, store the new items, then queue their article bodies. */
export const fetchSource = inngest.createFunction(
  {
    id: 'daily-fetch-source',
    triggers: [{ event: 'daily/source.fetch' }],
    concurrency: 4,
    retries: 1,
  },
  async ({ event, step }) => {
    if (!collectEnabled()) return { skipped: 'COLLECT_ENABLED is not "true"' }
    const sourceId = Number(event.data.sourceId)

    const result = await step.run('fetch-and-store', () => collectSource(sourceId))

    if (result.freshIds.length) {
      await step.sendEvent(
        'queue-content',
        result.freshIds.map((itemId) => ({ name: 'daily/item.fetch-content', data: { itemId } })),
      )
    }
    return result
  },
)

/** One item: fetch the original page and keep its readable text. */
export const fetchItemContent = inngest.createFunction(
  {
    id: 'daily-fetch-item-content',
    triggers: [{ event: 'daily/item.fetch-content' }],
    concurrency: 4,
    retries: 2,
  },
  async ({ event, step }) => {
    if (!collectEnabled()) return { skipped: 'COLLECT_ENABLED is not "true"' }
    return step.run('fetch-content', () => fetchContent(Number(event.data.itemId)))
  },
)

export const dailyCollectFunctions = [collectDueSources, fetchSource, fetchItemContent]
