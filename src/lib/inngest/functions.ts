import { dailyCollectFunctions } from '@/modules/daily/collect/jobs'
import { dailyJudgeFunctions } from '@/modules/daily/judge/jobs'
import { dailyWriteFunctions } from '@/modules/daily/write/jobs'

import { healthCheck } from './functions/health'

/** Every Inngest function the app serves. Add module jobs here as they are built. */
export const functions = [healthCheck, ...dailyCollectFunctions, ...dailyJudgeFunctions, ...dailyWriteFunctions]
