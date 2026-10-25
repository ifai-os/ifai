import { isLaunched } from '@/config/site'
import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'

import { cleanUpCircleMedia } from './cleanup'

/** Every hour: pictures nobody posted, pictures and covers nothing uses, videos no post links (./cleanup.ts). */
export const cleanUpCirclesMedia = inngest.createFunction(
  { id: 'circles-media-cleanup', triggers: [{ cron: 'TZ=UTC 17 * * * *' }], concurrency: { limit: 1 }, retries: 2 },
  async ({ step }) =>
    step.run('clean', async () => {
      // Before the circles launch nobody can upload anything.
      if (!isLaunched('circles')) return { skipped: true }
      const { payload } = await getDb()
      return cleanUpCircleMedia(payload)
    }),
)

export const circlesFunctions = [cleanUpCirclesMedia]
