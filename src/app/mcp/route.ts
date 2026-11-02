import { handleMcp, mcpPreflight, withCors } from '@/modules/agents/mcp'

export const dynamic = 'force-dynamic'

/** IFAI's MCP server (docs/specs/agents.md「MCP」): Streamable HTTP, stateless. */
async function serve(request: Request) {
  return withCors(await handleMcp(request))
}

export const GET = serve
export const POST = serve
export const DELETE = serve

export function OPTIONS(request: Request) {
  return mcpPreflight(request)
}
