import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { locales, type Locale } from '@/i18n/config'
import { topicDescription, topicDescriptionRoom, widthOf } from '@/modules/daily/public/topic-description'

import en from '../../../messages/en.json'
import ja from '../../../messages/ja.json'
import ko from '../../../messages/ko.json'
import zhHans from '../../../messages/zh-hans.json'
import zhHant from '../../../messages/zh-hant.json'

const messages: Record<Locale, typeof en> = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, ko }
const daily = (locale: Locale) => createTranslator({ locale, messages: messages[locale], namespace: 'daily' })

const story = (title: string) => ({ publishedAt: '2026-10-31T09:00:00Z', title: { value: title } })
const deepseek = { name: 'DeepSeek', total: 45, stories: [story('DeepSeek 提出 Super-agent 架构：告别单会话，让 AI 主动并行干活')] }

describe('a topic page’s description', () => {
  it('names the topic, how many stories and the newest one with its day', () => {
    expect(topicDescription(deepseek, 1, 'zh-Hans', daily('zh-Hans'))).toBe(
      'DeepSeek 的 AI 新闻 45 条，最近一条（10月31日）：「DeepSeek 提出 Super-agent 架构：告别单会话，让 AI 主动并行干活」。每条都核对过来源，配白话摘要。',
    )
    expect(topicDescription({ ...deepseek, stories: [story('DeepSeek ships V4')] }, 1, 'en', daily('en'))).toBe(
      '45 stories about DeepSeek. Latest (October 31): “DeepSeek ships V4”. Each checked against its sources, with a plain-language summary.',
    )
  })

  it('says which page a later page is, without the newest story', () => {
    expect(topicDescription(deepseek, 2, 'zh-Hans', daily('zh-Hans'))).toBe('DeepSeek 的 AI 新闻 45 条，这是第 2 页。每条都核对过来源，配白话摘要。')
  })

  it('shortens a long story title so the whole fits in a search result, in every language', () => {
    const long = { ...deepseek, stories: [story('长'.repeat(200))] }
    for (const locale of locales) {
      const text = topicDescription(long, 1, locale, daily(locale))
      expect(widthOf(text, locale)).toBeLessThanOrEqual(topicDescriptionRoom[locale])
      expect(widthOf(text, locale)).toBeGreaterThan(topicDescriptionRoom[locale] - 3)
      expect(text).toContain('…')
      expect(text).toContain('DeepSeek')
    }
  })

  it('keeps an English description to 160 characters', () => {
    const long = { ...deepseek, stories: [story('word '.repeat(60).trim())] }
    const text = topicDescription(long, 1, 'en', daily('en'))
    expect(text.length).toBeLessThanOrEqual(160)
    expect(text).toContain('word…”')
  })
})
