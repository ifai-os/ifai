import { revalidateTag } from 'next/cache'

/**
 * Cache tag of everything that shows published stories: the daily list, detail pages, the
 * home page's「今天的 AI」and the RSS feeds (step 5 tags its cached reads with it). Publishing,
 * correcting, merging and withdrawing refresh it, so readers see the change within a minute.
 */
export const DAILY_CACHE_TAG = 'daily'

export async function refreshDailyCache(): Promise<void> {
  try {
    revalidateTag(DAILY_CACHE_TAG, 'max')
  } catch (error) {
    // Outside a request (scripts, tests) there is no cache to refresh.
    console.warn('daily cache refresh skipped:', error instanceof Error ? error.message : error)
  }
}
