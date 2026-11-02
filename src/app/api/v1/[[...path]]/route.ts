import { handleRest, methodNotAllowed, preflight } from '@/modules/agents/rest'

// Answers depend on the query string; the CDN keeps them for a minute (Cache-Control in ./rest).
export const dynamic = 'force-dynamic'

/** The open API for agents (docs/specs/agents.md「开放 API」): GET /api/v1/… reads IFAI as JSON or Markdown. */
export function GET(request: Request) {
  return handleRest(request)
}

export function OPTIONS() {
  return preflight()
}

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
