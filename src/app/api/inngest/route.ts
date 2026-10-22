import { serve } from 'inngest/next'

import { inngest } from '@/lib/inngest/client'
import { functions } from '@/lib/inngest/functions'

// Inngest calls this endpoint to register and run background jobs.
export const { GET, POST, PUT } = serve({ client: inngest, functions })

// Steps can wait on slow model calls; Vercel's limit applies per step, not per job.
export const maxDuration = 300
