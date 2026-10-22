import createMiddleware from 'next-intl/middleware'

import { routing } from './i18n/routing'

// Next.js 16 "proxy" (formerly middleware): locale detection, redirects and rewrites.
export default createMiddleware(routing)

export const config = {
  // Skip Payload (/admin, /api), Next.js internals and anything with a file extension.
  matcher: ['/((?!api|admin|_next|_vercel|.*\\..*).*)'],
}
