import { admit } from '@/modules/agents/gate'
import { handleMcp, isBrowserVisit, mcpPreflight, withCors } from '@/modules/agents/mcp'

export const dynamic = 'force-dynamic'

/**
 * IFAI's MCP server (docs/specs/agents.md「MCP」): Streamable HTTP, stateless. A person who opens it
 * in a browser reads how to connect; an MCP request is let in first, as the agent behind its key
 * or as a visitor, within the limit.
 */
async function serve(request: Request) {
  if (isBrowserVisit(request)) return withCors(await handleMcp(request))
  const admission = await admit(request)
  if ('response' in admission) return withCors(admission.response)
  return withCors(await handleMcp(request, admission.caller))
}

export const GET = serve
export const POST = serve
export const DELETE = serve

export function OPTIONS(request: Request) {
  return mcpPreflight(request)
}
