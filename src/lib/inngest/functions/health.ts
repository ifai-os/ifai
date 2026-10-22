import { ai } from '@/lib/ai'
import { collectEnabled, modelCallsEnabled } from '@/lib/switches'

import { inngest } from '../client'

/**
 * Send the event `ifai/health.check` from the Inngest dashboard to confirm the app is
 * connected: it reports both switches and today's model spend without calling a model.
 */
export const healthCheck = inngest.createFunction(
  { id: 'health-check', triggers: [{ event: 'ifai/health.check' }] },
  async ({ step }) => {
    const usage = await step.run('usage-today', () => ai.usageToday())
    return { collectEnabled: collectEnabled(), modelCallsEnabled: modelCallsEnabled(), usage }
  },
)
