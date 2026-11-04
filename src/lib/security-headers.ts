/**
 * Response headers on every page and API answer (docs/specs/security.md「响应头」). Only headers
 * that cannot break the site: no script or style CSP yet, because Next.js and the Payload admin
 * write inline scripts; that waits for a nonce-based CSP tried in report-only mode first.
 */
export const securityHeaders: { key: string; value: string }[] = [
  // HTTPS only for two years. No includeSubDomains: other hosts under the domain (mail and the
  // like) are not ours to promise HTTPS for.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  // Browsers must not guess a file's type: an uploaded image is never run as a script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Other sites see only our origin, not the page or its query (search words, tokens in links).
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Only our own pages may frame us (clickjacking); X-Frame-Options for browsers without CSP.
  // base-uri and object-src close two old tricks and cost nothing.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Features the site never uses. Fullscreen and autoplay stay allowed for the embedded videos.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
]
