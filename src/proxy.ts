import createMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'

import { closedPathRedirect } from './config/site'
import { localeFromPathSegment, localizePath } from './i18n/config'
import { routing } from './i18n/routing'

const intl = createMiddleware(routing)

/** Payload's admin-language cookie (payload.config.ts i18n). */
const ADMIN_LANGUAGE_COOKIE = 'payload-lng'

/**
 * The back office opens in Chinese until the owner picks English in its header. Without this,
 * Payload follows the browser's Accept-Language and an English browser gets an English back office.
 */
function adminLanguage(request: NextRequest): NextResponse {
  if (request.cookies.has(ADMIN_LANGUAGE_COOKIE)) return NextResponse.next()
  const headers = new Headers(request.headers)
  const cookie = headers.get('cookie')
  headers.set('cookie', `${cookie ? `${cookie}; ` : ''}${ADMIN_LANGUAGE_COOKIE}=zh`)
  const response = NextResponse.next({ request: { headers } })
  response.cookies.set({ name: ADMIN_LANGUAGE_COOKIE, value: 'zh', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return response
}

/**
 * Pages of a module closed for now (src/config/site.ts `closedModules`), and the home page while
 * it is mostly closed modules, go to the daily in the same language. Temporary (307), so search
 * engines and browsers don't keep it once the modules open. Addresses without a language get
 * theirs first from next-intl, then come back here.
 */
function closedRedirect(request: NextRequest): NextResponse | null {
  const [, segment, ...rest] = request.nextUrl.pathname.split('/')
  const locale = localeFromPathSegment(segment)
  if (!locale) return null
  const target = closedPathRedirect(`/${rest.join('/')}`)
  if (!target) return null
  const url = request.nextUrl.clone()
  url.pathname = localizePath(locale, target)
  url.search = ''
  return NextResponse.redirect(url, 307)
}

// Next.js 16 "proxy" (formerly middleware): locale detection, redirects and rewrites for the site;
// the admin's default language for /admin.
export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/admin' || request.nextUrl.pathname.startsWith('/admin/')) {
    return adminLanguage(request)
  }
  return closedRedirect(request) ?? intl(request)
}

export const config = {
  // The site: skip Payload (/admin, /api), the MCP endpoint (/mcp), Next.js internals and anything
  // with a file extension. The admin pages: only to set their default language.
  matcher: ['/admin', '/admin/:path*', '/((?!api|admin|mcp|_next|_vercel|.*\\..*).*)'],
}
