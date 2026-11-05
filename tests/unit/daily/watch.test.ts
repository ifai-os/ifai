import { describe, expect, it } from 'vitest'

import { staleEmail } from '@/modules/daily/watch/alert'
import { quietHours, shouldAlert, staleAfterHours, staleAlertsOn } from '@/modules/daily/watch/rules'

const at = (iso: string) => new Date(iso)
const last = at('2026-11-05T00:00:00Z')
const hoursLater = (hours: number) => new Date(last.getTime() + hours * 3600_000)

describe('stale alert rules', () => {
  it('stays quiet before the threshold and with no stories at all', () => {
    expect(shouldAlert(last, hoursLater(11.9), 12)).toBe(false)
    expect(shouldAlert(null, hoursLater(100), 12)).toBe(false)
  })

  it('alerts once in the first 3-hour window, then once a day', () => {
    const runs = Array.from({ length: 30 }, (_, index) => index * 3 + 0.33) // a run every 3 hours
    const alerted = runs.filter((hours) => shouldAlert(last, hoursLater(hours), 12))
    expect(alerted).toEqual([12.33, 36.33, 60.33, 84.33])
  })

  it('reads the threshold and the switch from the environment', () => {
    expect(staleAfterHours({})).toBe(12)
    expect(staleAfterHours({ DAILY_STALE_ALERT_HOURS: '24' })).toBe(24)
    expect(staleAfterHours({ DAILY_STALE_ALERT_HOURS: '1' })).toBe(12)
    expect(staleAlertsOn({ VERCEL_ENV: 'production' })).toBe(true)
    expect(staleAlertsOn({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(staleAlertsOn({ VERCEL_ENV: 'preview', DAILY_STALE_ALERT: 'on' })).toBe(true)
    expect(staleAlertsOn({ VERCEL_ENV: 'production', DAILY_STALE_ALERT: 'off' })).toBe(false)
  })

  it('writes an email that says how long and where to look', () => {
    expect(quietHours(last, hoursLater(13.5))).toBe(13)
    const email = staleEmail({ lastApprovedAt: last, hours: 13, collecting: false, adminUrl: 'https://ifai.io/admin/collections/stories/review' })
    expect(email.heading).toBe('日报已经 13 小时没有新发布')
    expect(email.paragraphs.join('')).toContain('STORY_IMPORT_TOKEN')
    expect(email.button?.href).toContain('/review')
  })
})
