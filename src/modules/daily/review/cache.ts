import { revalidateTag } from 'next/cache'

/**
 * Cache tag of everything that shows published stories: the daily list and category pages,
 * story pages, the home page's「今天的 AI」and the RSS feeds (src/modules/daily/public/data.ts
 * tags every cached read with it). Publishing, correcting, merging and withdrawing refresh
 * it, so readers see the change within a minute.
 */
export const DAILY_CACHE_TAG = 'daily'

export async function refreshDailyCache(): Promise<void> {
  try {
    // Expire now rather than serve one more stale page: the editor checks right after publishing.
    revalidateTag(DAILY_CACHE_TAG, { expire: 0 })
  } catch (error) {
    // Outside a request (scripts, tests) there is no cache to refresh.
    console.warn('daily cache refresh skipped:', error instanceof Error ? error.message : error)
  }
}
