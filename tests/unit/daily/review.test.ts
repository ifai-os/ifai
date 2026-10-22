import { describe, expect, it } from 'vitest'

import { assistPrompt, cleanSuggestion, rewritePrompt } from '@/modules/daily/prompts'
import {
  SUMMARY_MAX,
  TITLE_MAX,
  compareQueue,
  hansHash,
  localeStates,
  localesToRewrite,
  needsAttention,
  nextAfter,
  primaryDecision,
  primaryEnabled,
  queueFlags,
  stillMissing,
  textLength,
} from '@/modules/daily/review/rules'

describe('review rules', () => {
  it('counts text the way the board does: CJK 1, ASCII ½', () => {
    expect(textLength('NVIDIA 开源 Nemotron 3 Nano')).toBe(14)
    expect(textLength('')).toBe(0)
    expect(textLength(null)).toBe(0)
    expect(TITLE_MAX).toBe(40)
    expect(SUMMARY_MAX).toBe(120)
  })

  it('fingerprints the simplified Chinese, ignoring whitespace noise', () => {
    const a = hansHash({ title: 'Acme 发布 Model 2', summary: '摘要', tryIt: '' })
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(hansHash({ title: ' Acme  发布 Model 2 ', summary: '摘要\n', tryIt: null })).toBe(a)
    expect(hansHash({ title: 'Acme 发布 Model 3', summary: '摘要', tryIt: '' })).not.toBe(a)
  })

  it('tells written, stale, failed and missing languages apart', () => {
    const hash = hansHash({ title: 't', summary: 's' })
    const states = localeStates(
      {
        en: { status: 'written', basedOn: hash },
        ja: { status: 'written', basedOn: 'old' },
        ko: { status: 'failed', error: 'timeout' },
      },
      hash,
    )
    expect(states).toEqual({ en: 'written', ja: 'stale', ko: 'failed' })
    expect(localesToRewrite(states)).toEqual(['ja', 'ko'])
    expect(localeStates(null, hash)).toEqual({ en: 'missing', ja: 'missing', ko: 'missing' })
    // Written before the fingerprint existed: counts as written until rewritten.
    expect(localeStates({ en: { status: 'written' } }, hash).en).toBe('written')
  })

  it('drops a missing token once the editor removed it from the text', () => {
    const verification = {
      ok: false,
      checked: 4,
      missing: [
        { locale: 'zh-Hans', token: '12 种' },
        { locale: 'en', token: 'Altman' },
      ],
    }
    expect(stillMissing(verification, { 'zh-Hans': '首批支持 12 种语言', en: 'Meta adds live translation' })).toEqual([{ locale: 'zh-Hans', token: '12 种' }])
    expect(stillMissing(verification, { 'zh-Hans': '首批支持十多种语言' })).toEqual([{ locale: 'en', token: 'Altman' }])
    expect(stillMissing(null, {})).toEqual([])
  })

  it('orders the queue by heat then score, with set-aside items last', () => {
    const items = [
      { id: 1, heat: 10, score: 90, createdAt: '2026-10-22T01:00:00Z' },
      { id: 2, heat: 50, score: 70, createdAt: '2026-10-22T02:00:00Z' },
      { id: 3, heat: 50, score: 80, createdAt: '2026-10-22T03:00:00Z' },
      { id: 4, heat: 99, score: 99, laterAt: '2026-10-22T05:00:00Z', createdAt: '2026-10-22T00:00:00Z' },
      { id: 5, heat: 0, score: 60, laterAt: '2026-10-22T04:00:00Z', createdAt: '2026-10-22T00:00:00Z' },
    ]
    expect([...items].sort(compareQueue).map((item) => item.id)).toEqual([3, 2, 1, 5, 4])
  })

  it('marks cards as the board does', () => {
    const flags = queueFlags({
      status: 'pending',
      moreReports: 3,
      duplicate: true,
      unverified: 1,
      failedLocales: ['ja'],
      scoreA: 70,
      scoreB: 84,
      flags: ['score_gap', 'promotional'],
      laterAt: '2026-10-22T00:00:00Z',
    })
    expect(flags.map((flag) => flag.kind)).toEqual(['more', 'duplicate', 'unverified', 'failed', 'gap', 'promotional', 'later'])
    expect(flags[4]).toEqual({ kind: 'gap', points: 14 })
    expect(needsAttention(flags)).toBe(true)
    const quiet = queueFlags({ status: 'withdrawn', moreReports: 2, duplicate: false, unverified: 0, failedLocales: [], flags: [], laterAt: null })
    expect(quiet.map((flag) => flag.kind)).toEqual(['more', 'withdrawn'])
    expect(needsAttention([{ kind: 'more', count: 2 }])).toBe(false)
  })

  it('offers the primary action in the board\'s order of precedence', () => {
    const base = {
      published: false,
      dirty: false,
      busy: false,
      duplicateOpen: false,
      states: { en: 'written', ja: 'written', ko: 'written' } as const,
      titleLength: 20,
      summaryLength: 100,
      unverified: 0,
    }
    expect(primaryDecision(base)).toEqual({ kind: 'ready' })
    expect(primaryDecision({ ...base, busy: true, duplicateOpen: true })).toEqual({ kind: 'busy' })
    expect(primaryDecision({ ...base, duplicateOpen: true, states: { ...base.states, ja: 'failed' } })).toEqual({ kind: 'duplicate' })
    expect(primaryDecision({ ...base, states: { ...base.states, ja: 'failed' }, titleLength: 50 })).toEqual({ kind: 'failed', locales: ['ja'] })
    expect(primaryDecision({ ...base, titleLength: 41 })).toEqual({ kind: 'tooLong', field: 'title' })
    expect(primaryDecision({ ...base, summaryLength: 121 })).toEqual({ kind: 'tooLong', field: 'summary' })
    expect(primaryDecision({ ...base, published: true })).toEqual({ kind: 'clean' })
    expect(primaryDecision({ ...base, published: true, dirty: true, states: { ...base.states, en: 'stale' } })).toEqual({ kind: 'rewrite', locales: ['en'] })
    expect(primaryDecision({ ...base, states: { ...base.states, ko: 'missing' } })).toEqual({ kind: 'rewrite', locales: ['ko'] })
    expect(primaryDecision({ ...base, unverified: 2 })).toEqual({ kind: 'unverified', count: 2 })
    expect(primaryEnabled({ kind: 'unverified', count: 2 })).toBe(true)
    expect(primaryEnabled({ kind: 'clean' })).toBe(false)
  })

  it('moves to the item that takes the handled one\'s place', () => {
    const queue = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(nextAfter(queue, 2)).toEqual({ id: 3 })
    expect(nextAfter(queue, 3)).toEqual({ id: 2 })
    expect(nextAfter(queue, 9)).toEqual({ id: 1 })
    expect(nextAfter([{ id: 1 }], 1)).toBeNull()
  })
})

describe('rewrite and assist prompts', () => {
  it('asks for exactly the requested languages, from the approved Chinese', () => {
    const text = rewritePrompt.build({
      hans: { title: 'Acme 发布 Model 2', summary: '售价 20 美元。', tryIt: '' },
      locales: ['ja', 'ko'],
      reports: [{ sourceName: 'Acme News', tier: 'T1', url: 'https://acme.example/x', title: 'Acme ships Model 2', content: 'Model 2 costs $20.' }],
    })
    expect(text).toContain('Requested languages: ja (Japanese), ko (Korean).')
    expect(text).toContain('Title: Acme 发布 Model 2')
    expect(text).toContain('Try it: (none)')
    expect(text).toContain('<external_data source="article">\nModel 2 costs $20.')
    const schema = rewritePrompt.schema(['ja', 'ko'])
    const locale = { title: 't', summary: 's', tryIt: '' }
    expect(schema.safeParse({ ja: locale, ko: locale }).success).toBe(true)
    expect(schema.safeParse({ ja: locale }).success).toBe(false)
    expect(rewritePrompt.version).toMatch(/^rewrite@[0-9a-f]{8}$/)
  })

  it('builds the two helpers and cleans their answers', () => {
    const text = assistPrompt.build({ kind: 'shorten', hans: { title: 't', summary: 's', tryIt: 'x' }, reportTitles: ['Report A'] })
    expect(text).toContain('Current summary: s')
    expect(text).toContain('<external_data source="report titles">\nReport A')
    expect(text).toMatch(/Write the shortened summary\.$/)
    expect(assistPrompt.instructions('title')).toContain('different title')
    expect(assistPrompt.version('title')).not.toBe(assistPrompt.version('shorten'))
    expect(cleanSuggestion('「ChatGPT 能做演示文稿了」')).toBe('ChatGPT 能做演示文稿了')
    expect(cleanSuggestion('标题：合影有人闭眼？\n')).toBe('合影有人闭眼？')
  })
})
