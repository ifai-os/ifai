import { Inngest } from 'inngest'

/**
 * Background jobs (collection, judging, writing, posters). Functions are listed in
 * ./functions.ts and served at /api/inngest. Locally, run the Inngest dev server and set
 * INNGEST_DEV=1; on Vercel the Inngest integration sets INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
 */
export const inngest = new Inngest({ id: 'ifai' })
