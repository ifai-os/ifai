import { describe, expect, it } from 'vitest'

import { securityHeaders } from '@/lib/security-headers'

const header = (key: string) => securityHeaders.find((h) => h.key === key)?.value

describe('security headers', () => {
  it('only our own pages may frame the site', () => {
    expect(header('Content-Security-Policy')).toContain("frame-ancestors 'self'")
    expect(header('X-Frame-Options')).toBe('SAMEORIGIN')
  })

  it('does not restrict scripts or styles yet (inline scripts from Next.js and Payload)', () => {
    expect(header('Content-Security-Policy')).not.toMatch(/script-src|style-src|default-src/)
  })

  it('leaves fullscreen and autoplay to the embedded videos', () => {
    expect(header('Permissions-Policy')).not.toMatch(/fullscreen|autoplay/)
  })

  it('keeps HSTS to this host', () => {
    expect(header('Strict-Transport-Security')).not.toContain('includeSubDomains')
    expect(header('X-Content-Type-Options')).toBe('nosniff')
  })
})
