import { appsHeatFunctions } from '@/modules/apps/metrics/jobs'
import { appsProfileFunctions } from '@/modules/apps/profile/jobs'
import { appsReviewFunctions } from '@/modules/apps/reviews/jobs'
import { appsSubmissionFunctions } from '@/modules/apps/submissions/jobs'
import { dailyCollectFunctions } from '@/modules/daily/collect/jobs'
import { dailyEmailFunctions } from '@/modules/daily/email/jobs'
import { dailyHeatFunctions } from '@/modules/daily/heat/jobs'
import { dailyJudgeFunctions } from '@/modules/daily/judge/jobs'
import { dailyWriteFunctions } from '@/modules/daily/write/jobs'
import { resourcesFunctions } from '@/modules/resources/import/jobs'

import { healthCheck } from './functions/health'

/** Every Inngest function the app serves. Add module jobs here as they are built. */
export const functions = [
  healthCheck,
  ...dailyCollectFunctions,
  ...dailyJudgeFunctions,
  ...dailyWriteFunctions,
  ...dailyHeatFunctions,
  ...dailyEmailFunctions,
  ...appsProfileFunctions,
  ...appsHeatFunctions,
  ...appsReviewFunctions,
  ...appsSubmissionFunctions,
  ...resourcesFunctions,
]
