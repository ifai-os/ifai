import { describe, expect, it } from 'vitest'

import {
  budgetOf,
  lastDays,
  parseSubject,
  periodFrom,
  purposeModules,
  purposeRows,
  shortError,
  sumDays,
} from '@/admin/model-usage/rules'
import { usageText } from '@/admin/model-usage/text'
import { dailyBudgetUsd, DEFAULT_DAILY_BUDGET_USD } from '@/lib/ai/limits'
import { contestPurposes, purposes } from '@/lib/ai/purposes'

describe('model usage page', () => {
  it('reads ?days= as one of the three periods, 7 days otherwise', () => {
    expect(periodFrom('1')).toBe(1)
    expect(periodFrom('30')).toBe(30)
    expect(periodFrom(['7', '30'])).toBe(7)
    expect(periodFrom(undefined)).toBe(7)
    expect(periodFrom('14')).toBe(7)
    expect(periodFrom('abc')).toBe(7)
  })

  it('lists the last 14 Shanghai days newest first, with zeros for quiet days', () => {
    // 01:30 on 24 Oct in Shanghai is still 23 Oct in UTC.
    const now = new Date('2026-10-23T17:30:00Z')
    const days = lastDays([{ date: '2026-10-22', succeeded: 3, failed: 1, costUsd: 0.5 }], now)
    expect(days).toHaveLength(14)
    expect(days[0]).toEqual({ date: '2026-10-24', succeeded: 0, failed: 0, costUsd: 0 })
    expect(days[2]).toEqual({ date: '2026-10-22', succeeded: 3, failed: 1, costUsd: 0.5 })
    expect(days[13].date).toBe('2026-10-11')
    expect(sumDays(days)).toEqual({ succeeded: 3, failed: 1, costUsd: 0.5 })
  })

  it('crosses month ends', () => {
    const days = lastDays([], new Date('2026-11-02T04:00:00Z'), 4)
    expect(days.map((day) => day.date)).toEqual(['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30'])
  })

  it('lists every purpose with its module and model, unused ones as zero, retired ones last', () => {
    const rows = purposeRows(
      [
        { purpose: 'write', succeeded: 4, failed: 1, inputTokens: 4000, outputTokens: 800, costUsd: 0.02 },
        { purpose: 'old-purpose', succeeded: 1, failed: 0, inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
      ],
      { AI_MODEL_DESCRIBE: 'anthropic/claude-sonnet-4.5' },
    )
    expect(rows.map((row) => row.purpose)).toEqual([...Object.keys(purposeModules), 'old-purpose'])
    const write = rows.find((row) => row.purpose === 'write')
    expect(write).toMatchObject({ module: 'daily', succeeded: 4, failed: 1, changed: false, averageUsd: 0.005 })
    expect(rows.find((row) => row.purpose === 'describe')).toMatchObject({
      module: 'resources',
      model: 'anthropic/claude-sonnet-4.5',
      changed: true,
      succeeded: 0,
      averageUsd: null,
    })
    expect(rows.find((row) => row.purpose === 'translate')?.module).toBe('apps')
    expect(rows.at(-1)).toMatchObject({ purpose: 'old-purpose', module: null, model: null, changed: false })
  })

  it('shows the arena purpose under rankings, without a model of its own', () => {
    const rows = purposeRows([{ purpose: 'arena', succeeded: 2, failed: 0, inputTokens: 300, outputTokens: 900, costUsd: 0.01 }], {})
    expect(rows.find((row) => row.purpose === 'arena')).toMatchObject({ module: 'rankings', model: null, changed: false, averageUsd: 0.005 })
  })

  it('knows the module of every purpose in purposes.ts', () => {
    expect(Object.keys(purposeModules).sort()).toEqual([...purposes, ...contestPurposes].sort())
    const zh = usageText('zh')
    const en = usageText('en')
    for (const purpose of [...purposes, ...contestPurposes]) {
      expect(zh.purposes.names[purpose]).toBeTruthy()
      expect(en.purposes.names[purpose]).toBeTruthy()
    }
  })

  it('measures today against the budget the call guard uses', () => {
    expect(budgetOf(2.5, 10)).toEqual({ spentUsd: 2.5, budgetUsd: 10, leftUsd: 7.5, ratio: 0.25, usedUp: false })
    expect(budgetOf(10, 10)).toMatchObject({ leftUsd: 0, ratio: 1, usedUp: true })
    expect(budgetOf(12, 10)).toMatchObject({ leftUsd: 0, ratio: 1, usedUp: true })
    expect(budgetOf(0, 0)).toMatchObject({ ratio: 1, usedUp: true })
    expect(dailyBudgetUsd({})).toBe(DEFAULT_DAILY_BUDGET_USD)
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '2.5' })).toBe(2.5)
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '-1' })).toBe(DEFAULT_DAILY_BUDGET_USD)
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: ' ' })).toBe(DEFAULT_DAILY_BUDGET_USD)
  })

  it('reads the subjects the modules write', () => {
    expect(parseSubject('stories:12')).toEqual({ kind: 'stories', id: 12 })
    expect(parseSubject('stories:12:shorten')).toEqual({ kind: 'stories', id: 12 })
    expect(parseSubject('raw_items:5')).toEqual({ kind: 'raw_items', id: 5 })
    expect(parseSubject('apps:3')).toEqual({ kind: 'apps', id: 3 })
    expect(parseSubject('app_reviews:9')).toEqual({ kind: 'app_reviews', id: 9 })
    expect(parseSubject('skill-versions:4')).toEqual({ kind: 'skill-versions', id: 4 })
    expect(parseSubject('arena-answers:7')).toEqual({ kind: 'arena-answers', id: 7 })
    expect(parseSubject('posters:1')).toBeNull()
    expect(parseSubject('apps:0')).toBeNull()
    expect(parseSubject('apps:x')).toBeNull()
    expect(parseSubject(null)).toBeNull()
  })

  it('shortens errors to one line', () => {
    expect(shortError('a\n  b')).toBe('a b')
    expect(shortError(null)).toBe('')
    const long = shortError('x'.repeat(400))
    expect(long).toHaveLength(300)
    expect(long.endsWith('…')).toBe(true)
  })

  it('shows small amounts with four decimals', () => {
    const t = usageText('zh')
    expect(t.money(0)).toBe('$0.00')
    expect(t.money(0.00004)).toBe('<$0.0001')
    expect(t.money(0.0042)).toBe('$0.0042')
    expect(t.money(1.234)).toBe('$1.23')
  })
})
