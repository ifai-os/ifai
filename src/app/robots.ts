import type { MetadataRoute } from 'next'

import { robotsFor } from '@/lib/robots'
import { siteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return robotsFor(siteUrl())
}
