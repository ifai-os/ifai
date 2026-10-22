import { describe, expect, it } from 'vitest'

import { writePrompt, writtenLocales } from '@/modules/daily/prompts'
import { slugify, storySlug } from '@/modules/daily/write/slug'
import { missingFrom, tokensToVerify, verifyWriting } from '@/modules/daily/write/verify'

describe('source check', () => {
  it('picks numbers and name-like Latin tokens, not ordinary words', () => {
    const tokens = tokensToVerify('Today OpenAI released GPT-5 for $20 a month. The model, called Duet, scores 92.5% on MMLU and costs 10,000 credits.')
    expect(tokens).toEqual(expect.arrayContaining(['OpenAI', 'GPT-5', '20', 'Duet', '92.5', 'MMLU', '10,000']))
    expect(tokens).not.toContain('Today')
    expect(tokens).not.toContain('The')
    expect(tokens).not.toContain('model')
    expect(tokens).not.toContain('AI')
  })

  it('finds Latin names inside Chinese, Japanese and Korean text, even at a sentence start', () => {
    expect(tokensToVerify('OpenAI 发布 GPT-5，价格 20 美元。Claude 也在列。')).toEqual(['20', 'OpenAI', 'GPT-5', 'Claude'])
    expect(tokensToVerify('NVIDIA가 H100을 공개했다')).toEqual(['NVIDIA', 'H100'])
  })

  it('leaves the first word of an English sentence alone but checks digits inside names as names', () => {
    expect(tokensToVerify('Today GPT-5 arrived. Tomorrow H100 follows.')).toEqual(['GPT-5', 'H100'])
  })

  it('reports what the reports do not contain, ignoring case and thousands separators', () => {
    const material = 'OpenAI today released GPT-5 at $20 per month, scoring 92.5% on MMLU; 10000 credits are included.'
    expect(missingFrom('OpenAI ships GPT-5 for $20; 92.5% on MMLU with 10,000 credits', material)).toEqual([])
    expect(missingFrom('OpenAI ships GPT-6 for $25, says Altman', material)).toEqual(['25', 'GPT-6', 'Altman'])
  })

  it('checks every language and says whether all of it was traceable', () => {
    const material = 'Acme launched Model 2 on Tuesday for 5 dollars.'
    const ok = verifyWriting({ en: 'Acme launches Model 2 for $5', 'zh-Hans': 'Acme 发布 Model 2，5 美元' }, material)
    expect(ok).toEqual({ ok: true, missing: [], checked: 7 })
    const bad = verifyWriting({ en: 'Acme launches Model 3', ja: 'Acme が Model 2 を 2026 年に発表' }, material)
    expect(bad.ok).toBe(false)
    expect(bad.missing).toEqual([
      { locale: 'en', token: '3' },
      { locale: 'ja', token: '2026' },
    ])
  })
})

describe('slugs', () => {
  it('normalises to lowercase ascii with hyphens', () => {
    expect(slugify('OpenAI Launches ChatGPT Slides!')).toBe('openai-launches-chatgpt-slides')
    expect(slugify('  Éclair & Crème  ')).toBe('eclair-creme')
    expect(slugify('中文标题')).toBe('')
    expect(slugify('a'.repeat(100)).length).toBe(80)
  })

  it('falls back from the suggestion to the English title to the id', () => {
    expect(storySlug('openai-launches-slides', 'OpenAI launches Slides', 7)).toBe('openai-launches-slides')
    expect(storySlug('', 'OpenAI launches Slides', 7)).toBe('openai-launches-slides')
    expect(storySlug('中文', '中文', 7)).toBe('story-7')
  })
})

describe('writing prompt', () => {
  it('lists reports most authoritative first, marks background and wraps outside text', () => {
    const text = writePrompt.build([
      { sourceName: 'OpenAI News', tier: 'T1', url: 'https://openai.com/x', title: 'We launch Slides', content: 'Slides is available today.', facts: [{ who: 'OpenAI', what: 'launched Slides', when: 'today' }] },
      { sourceName: 'The Verge AI', tier: 'T2', url: 'https://theverge.com/x', title: 'OpenAI adds Slides', summary: 'Short take', background: true },
    ])
    expect(text).toMatch(/^2 report\(s\) of the same event, most authoritative first\./)
    expect(text.indexOf('Report 1 — OpenAI News (official, first-hand)')).toBeLessThan(text.indexOf('Background report 2 — The Verge AI'))
    expect(text).toContain('<external_data source="article">\nSlides is available today.')
    expect(text).toContain('<external_data source="summary">\nShort take')
    expect(text).toContain('- OpenAI: launched Slides (today)')
  })

  it('wants four languages and a slug back', () => {
    const locale = { title: 't', summary: 's', tryIt: '' }
    expect(writePrompt.schema.safeParse({ slug: 'openai-slides', zhHans: locale, en: locale, ja: locale, ko: locale }).success).toBe(true)
    expect(writePrompt.schema.safeParse({ slug: 'openai-slides', zhHans: locale, en: locale, ja: locale }).success).toBe(false)
    expect(Object.values(writtenLocales)).toEqual(['zh-Hans', 'en', 'ja', 'ko'])
    expect(writePrompt.version).toMatch(/^write@[0-9a-f]{8}$/)
  })
})
