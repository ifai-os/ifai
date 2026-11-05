'use client'

import { Analytics } from '@vercel/analytics/next'

import { analyticsUrl } from '@/lib/analytics'

/** Page views for Vercel Web Analytics, with the address cleaned first (src/lib/analytics.ts). Sends nothing outside Vercel. */
export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: analyticsUrl(event.url) })} />
}
