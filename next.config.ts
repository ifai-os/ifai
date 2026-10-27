import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

import { localePrefixes } from './src/i18n/config'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// The daily moved from /daily to /news (站长, 2026-10-27, for search): old addresses, with or
// without a language prefix, go to the same page under /news for good. The query string comes along.
const prefixes = Object.values(localePrefixes)
  .map((prefix) => prefix.slice(1))
  .join('|')

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: `/:locale(${prefixes})/daily`, destination: '/:locale/news', permanent: true },
      { source: `/:locale(${prefixes})/daily/:path*`, destination: '/:locale/news/:path*', permanent: true },
      { source: '/daily', destination: '/news', permanent: true },
      { source: '/daily/:path*', destination: '/news/:path*', permanent: true },
    ]
  },
  async rewrites() {
    return {
      // /api/skills/<slug>/<version>.zip (docs/specs/resources.md). A route folder there would also
      // catch Payload's own /api/skills/<id>/<action> endpoints, so only version-shaped .zip names go here.
      beforeFiles: [{ source: '/api/skills/:slug/:file(\\d[0-9A-Za-z.+-]*\\.zip)', destination: '/api/skill-zips/:slug/:file' }],
    }
  },
}

export default withPayload(withNextIntl(nextConfig), { devBundleServerPackages: false })
