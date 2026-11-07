import { afterEach, describe, expect, it, vi } from 'vitest'

import { cronWhen } from '@/lib/inngest/cron'

/** The cron triggers of every registered function, by id, as the app registers them with these switches. */
async function crons(env: Record<string, string>): Promise<Record<string, string[]>> {
  vi.resetModules()
  for (const name of ['COLLECT_ENABLED', 'MODEL_CALLS_ENABLED', 'DAILY_EMAIL_ENABLED', 'STORY_ILLUSTRATIONS_ENABLED']) {
    vi.stubEnv(name, env[name] ?? '')
  }
  const { functions } = await import('@/lib/inngest/functions')
  return Object.fromEntries(
    functions.map((fn) => {
      const triggers = (fn as unknown as { opts: { triggers?: { cron?: string }[] } }).opts.triggers ?? []
      return [fn.id(), triggers.flatMap((trigger) => (trigger.cron ? [trigger.cron] : []))]
    }),
  )
}

describe('cronWhen', () => {
  it('keeps the schedule only while the switch is on', () => {
    expect(cronWhen(true, '*/15 * * * *')).toEqual([{ cron: '*/15 * * * *' }])
    expect(cronWhen(false, '*/15 * * * *')).toEqual([])
  })
})

describe('scheduled jobs follow their switches', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const switched = [
    'daily-collect-due-sources',
    'daily-judge-sweep',
    'daily-write-sweep',
    'daily-illustrate-sweep',
    'daily-email-send',
    'rankings-external',
    'skill-describe-sweep',
    'apps-draft-sweep',
    'apps-review-translate-sweep',
  ]

  it('leaves out the schedules of jobs whose switch is off', async () => {
    const off = await crons({})
    for (const id of switched) expect(off[id], id).toEqual([])
    // Jobs without a switch keep their schedule.
    expect(off['daily-heat-refresh']).toEqual(['5 * * * *'])
  }, 60_000)

  it('keeps them all when the switches are on', async () => {
    const on = await crons({ COLLECT_ENABLED: 'true', MODEL_CALLS_ENABLED: 'true', DAILY_EMAIL_ENABLED: 'true', STORY_ILLUSTRATIONS_ENABLED: 'true' })
    for (const id of switched) expect(on[id], id).toHaveLength(1)
  }, 60_000)
})
