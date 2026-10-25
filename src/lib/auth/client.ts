import { inferAdditionalFields, magicLinkClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/** Browser-side auth client. Talks to /api/auth on the same origin. */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    // The page address is in the session (src/lib/auth/auth.ts): the account menu links to it.
    inferAdditionalFields({ user: { handle: { type: 'string', required: false, input: false } } }),
  ],
})
