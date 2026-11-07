import { Inngest } from 'inngest'

/**
 * Background jobs (collection, judging, writing, posters). Functions are listed in
 * ./functions.ts and served at /api/inngest. Locally, run the Inngest dev server and set
 * INNGEST_DEV=1. Production talks to the self-hosted Inngest server on the Mac Studio through
 * INNGEST_BASE_URL, INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY (docs/setup.md step 9).
 */
export const inngest = new Inngest({
  id: 'ifai',
  // Dev mode skips Inngest's request signatures, so in production it stays off even if
  // INNGEST_DEV was copied over from a local .env: anyone could otherwise run our jobs through
  // /api/inngest (docs/specs/security.md).
  ...(process.env.VERCEL_ENV === 'production' && { isDev: false }),
})
