import { admit } from '@/modules/agents/gate'
import { handleRest, methodNotAllowed, preflight } from '@/modules/agents/rest'

// Answers depend on the query string and the key; the CDN keeps keyless ones for a minute (Cache-Control in ./rest).
export const dynamic = 'force-dynamic'

/**
 * The open API for agents (docs/specs/agents.md「开放 API」): GET /api/v1/… reads IFAI as JSON or
 * Markdown. A request is let in first: the agent behind its key, or a visitor, within the limit.
 */
export async function GET(request: Request) {
  const admission = await admit(request)
  if ('response' in admission) return admission.response
  return handleRest(request, admission.caller)
}

export function OPTIONS() {
  return preflight()
}

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
