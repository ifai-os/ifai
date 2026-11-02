import { siteUrl } from '@/lib/site-url'
import { llmsTxt } from '@/modules/agents/llms'
import { launchedOperations } from '@/modules/agents/operations'

/** /llms.txt (llmstxt.org): how agents read IFAI. It changes only with a deploy. */
export function GET() {
  return new Response(llmsTxt(siteUrl(), launchedOperations()), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
