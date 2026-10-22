import { toNextJsHandler } from 'better-auth/next-js'

import { auth } from '@/lib/auth/auth'

// Better Auth endpoints: /api/auth/* (sign-in, callbacks, magic-link verify, session).
export const { GET, POST } = toNextJsHandler(auth)
