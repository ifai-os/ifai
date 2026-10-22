import { dailyCollectFunctions } from '@/modules/daily/collect/jobs'

import { healthCheck } from './functions/health'

/** Every Inngest function the app serves. Add module jobs here as they are built. */
export const functions = [healthCheck, ...dailyCollectFunctions]
