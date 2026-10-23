import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return {
      // /api/skills/<slug>/<version>.zip (docs/specs/resources.md). A route folder there would also
      // catch Payload's own /api/skills/<id>/<action> endpoints, so only version-shaped .zip names go here.
      beforeFiles: [{ source: '/api/skills/:slug/:file(\\d[0-9A-Za-z.+-]*\\.zip)', destination: '/api/skill-zips/:slug/:file' }],
    }
  },
}

export default withPayload(withNextIntl(nextConfig), { devBundleServerPackages: false })
