/**
 * Whether a request comes from another site's page. Browsers say so in Sec-Fetch-Site; older ones
 * only send Origin. Requests without either (not from a browser page) are left to the session check.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site) return site !== 'same-origin'
  const origin = request.headers.get('origin')
  return origin !== null && origin !== new URL(request.url).origin
}
