import { RetryAfterError } from 'inngest'

import { ModelCallError, ReceiptExhaustedError } from '@/lib/ai/errors'
import { inngest } from '@/lib/inngest/client'
import { collectEnabled, modelCallsEnabled } from '@/lib/switches'

import { findStaleItems, judgeSteps, markBlocked, type StepResult } from './judge'

export type Guarded<T> =
  | T
  /** The switch is off, the budget is spent or the key is missing: nothing changed, try later. */
  | { status: 'paused'; reason: string }
  /** The same call failed three times; the item is marked and waits for a person. */
  | { status: 'blocked'; reason: string }

/**
 * Model-call failures by kind: a call already running elsewhere is retried after a pause;
 * a closed switch, spent budget or missing key leaves the item untouched for the sweep to
 * retry later; a call that failed three times blocks the item and stops the job.
 */
export async function guarded<T>(itemId: number, run: () => Promise<T>): Promise<Guarded<T>> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof ModelCallError)) throw error
    if (error.retryable) throw new RetryAfterError(error.message, '2m')
    if (error instanceof ReceiptExhaustedError) {
      await markBlocked(itemId, error.message)
      return { status: 'blocked', reason: error.message }
    }
    return { status: 'paused', reason: error.message }
  }
}

/**
 * One report through prefilter → two scores → structure → vector → grouping, each its own
 * step; a report that ends up queued is handed to the writing job.
 */
export const judgeItem = inngest.createFunction(
  { id: 'daily-judge-item', triggers: [{ event: 'daily/item.judge' }], concurrency: 3, retries: 2 },
  async ({ event, step }) => {
    if (!modelCallsEnabled()) return { status: 'paused', reason: 'MODEL_CALLS_ENABLED is not "true"' }
    const itemId = Number(event.data.itemId)
    let last: Guarded<StepResult> = { status: 'stopped', reason: 'no steps' }
    for (const [name, run] of judgeSteps) {
      last = await step.run(name, () => guarded(itemId, () => run(itemId)))
      if (last.status !== 'done' || last.outcome !== 'pending') break
    }
    if (last.status === 'done' && last.outcome === 'queued') {
      await step.sendEvent('write', { name: 'daily/story.write', data: { itemId } })
    }
    return last
  },
)

/**
 * Every 30 minutes (or on `daily/judge.sweep`): push along items that fell through the cracks,
 * such as ones queued while the switch was off or whose job died.
 */
export const judgeSweep = inngest.createFunction(
  { id: 'daily-judge-sweep', triggers: [{ cron: '*/30 * * * *' }, { event: 'daily/judge.sweep' }] },
  async ({ step }) => {
    if (!collectEnabled()) return { skipped: 'COLLECT_ENABLED is not "true"' }
    const stale = await step.run('find-stale-items', () => findStaleItems(new Date()))
    if (stale.content.length) {
      await step.sendEvent(
        'refetch-content',
        stale.content.map((itemId) => ({ name: 'daily/item.fetch-content', data: { itemId } })),
      )
    }
    if (stale.judge.length && modelCallsEnabled()) {
      await step.sendEvent(
        'judge',
        stale.judge.map((itemId) => ({ name: 'daily/item.judge', data: { itemId } })),
      )
    }
    return { judge: stale.judge.length, content: stale.content.length, modelCalls: modelCallsEnabled() }
  },
)

export const dailyJudgeFunctions = [judgeItem, judgeSweep]
