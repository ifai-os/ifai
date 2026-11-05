import type { Access, PayloadRequest, Where } from 'payload'

/**
 * Read access for collections that readers see on the site.
 *
 * Signed-in admins read everything. The site's own pages read through the Local API with the
 * visitor's rules (`overrideAccess: false`), so they get `visible` (published stories, shown
 * circles…). Payload's public REST endpoints (`/api/<collection>`) are not used by any page, and
 * anonymously they would hand out the whole table with back-office fields (scores, flags, prompt
 * versions) and no page-size cap, so they answer 403 to visitors. The open API (`/api/v1`) and
 * MCP are the public way in; they are rate-limited (docs/specs/security.md).
 */
export function readerAccess(visible: Where | true): Access {
  return ({ req }) => (req.user ? true : isPublicEndpoint(req) ? false : visible)
}

/** Whether the request came through Payload's own REST (or GraphQL) routes, not the Local API. */
export function isPublicEndpoint(req: Pick<PayloadRequest, 'payloadAPI'>): boolean {
  return req.payloadAPI === 'REST' || req.payloadAPI === 'GraphQL'
}
