import { describe, expect, it } from 'vitest'

import { detectLanguage } from '@/lib/i18n/detect'
import {
  cleanName,
  cleanText,
  parseId,
  parseReportInput,
  parseReviewInput,
  reviewRules,
  summarize,
  textLength,
} from '@/modules/apps/reviews/rules'

describe('parseId', () => {
  it('reads a positive whole number from a query string or a JSON body', () => {
    expect(parseId('12')).toBe(12)
    expect(parseId(12)).toBe(12)
    expect(parseId(2 ** 31 - 1)).toBe(2 ** 31 - 1)
  })

  it('refuses anything else', () => {
    for (const value of ['0', '-1', '1.5', '012', 'abc', '', '99999999999', 0, -3, 1.5, 2 ** 31, null, undefined, {}]) {
      expect(parseId(value), String(value)).toBeNull()
    }
  })
})

describe('cleanText', () => {
  it('keeps line breaks, folds blank lines and trims', () => {
    expect(cleanText('  Good app.\r\n\r\n\r\n\r\nFast too.  \r\n')).toBe('Good app.\n\nFast too.')
    expect(cleanText('one  \ntwo')).toBe('one\ntwo')
  })

  it('drops control characters, zero-width spaces and direction overrides', () => {
    expect(cleanText('a\u0007b\u200bc\u202ed\u2066e\ufeff')).toBe('abcde')
  })

  it('keeps the joiners emoji sequences need', () => {
    expect(cleanText('👩\u200d💻 好用')).toBe('👩\u200d💻 好用')
  })

  it('is empty when nothing visible is left', () => {
    expect(cleanText(' \u200b\n\t ')).toBe('')
  })
})

describe('textLength', () => {
  it('counts characters as readers do, emoji and CJK included', () => {
    expect(textLength('好用👍')).toBe(3)
    expect(textLength('abc')).toBe(3)
  })
})

describe('cleanName', () => {
  it('makes one line of at most the name limit', () => {
    expect(cleanName('  Ada\n  Lovelace ')).toBe('Ada Lovelace')
    expect(cleanName('名'.repeat(40))).toBe('名'.repeat(reviewRules.maxName))
    expect(cleanName('a\u202eb')).toBe('ab')
  })

  it('is empty for a member without a name', () => {
    expect(cleanName('')).toBe('')
    expect(cleanName(' \u200b ')).toBe('')
  })
})

describe('parseReviewInput', () => {
  const valid = { app: 12, rating: 4, body: '  Works well.  ', locale: 'en' }

  it('takes an app, a whole-star rating, the text and the page language', () => {
    expect(parseReviewInput(valid)).toEqual({ ok: true, value: { app: 12, rating: 4, body: 'Works well.', locale: 'en' } })
    expect(parseReviewInput({ ...valid, app: '12', locale: 'zh-Hant' })).toEqual({
      ok: true,
      value: { app: 12, rating: 4, body: 'Works well.', locale: 'zh-Hant' },
    })
  })

  it('says what is wrong', () => {
    expect(parseReviewInput(null)).toEqual({ ok: false, error: 'invalid-app' })
    expect(parseReviewInput({ ...valid, app: 0 })).toEqual({ ok: false, error: 'invalid-app' })
    for (const rating of [0, 6, 3.5, '4', null]) {
      expect(parseReviewInput({ ...valid, rating }), String(rating)).toEqual({ ok: false, error: 'invalid-rating' })
    }
    expect(parseReviewInput({ ...valid, body: ' \u200b ' })).toEqual({ ok: false, error: 'empty-body' })
    expect(parseReviewInput({ ...valid, body: 42 })).toEqual({ ok: false, error: 'empty-body' })
    for (const locale of ['fr', 'zh-hans', undefined]) {
      expect(parseReviewInput({ ...valid, locale }), String(locale)).toEqual({ ok: false, error: 'invalid-locale' })
    }
  })

  it('counts the length in characters', () => {
    expect(parseReviewInput({ ...valid, body: '👍'.repeat(reviewRules.maxBody) }).ok).toBe(true)
    expect(parseReviewInput({ ...valid, body: 'a'.repeat(reviewRules.maxBody + 1) })).toEqual({ ok: false, error: 'body-too-long' })
  })
})

describe('parseReportInput', () => {
  it('takes a review and one of the reasons', () => {
    expect(parseReportInput({ review: '7', reason: 'spam' })).toEqual({ review: 7, reason: 'spam' })
    expect(parseReportInput({ review: 7, reason: 'offTopic' })).toEqual({ review: 7, reason: 'offTopic' })
  })

  it('refuses anything else', () => {
    expect(parseReportInput({ review: 7, reason: 'boring' })).toBeNull()
    expect(parseReportInput({ review: 7, reason: 'toString' })).toBeNull()
    expect(parseReportInput({ review: 'x', reason: 'spam' })).toBeNull()
    expect(parseReportInput(undefined)).toBeNull()
  })
})

describe('summarize', () => {
  it('shows the average, to one decimal, from five reviews on', () => {
    expect(summarize(0, 0)).toEqual({ count: 0, average: null })
    expect(summarize(4, 20)).toEqual({ count: 4, average: null })
    expect(summarize(5, 22)).toEqual({ count: 5, average: 4.4 })
    expect(summarize(6, 25)).toEqual({ count: 6, average: 4.2 })
  })
})

describe('detectLanguage', () => {
  it('goes by the script', () => {
    expect(detectLanguage('정말 좋아요', 'en')).toBe('ko')
    expect(detectLanguage('とても便利です', 'en')).toBe('ja')
    expect(detectLanguage('Great for drafts', 'ja')).toBe('en')
    expect(detectLanguage('Отличное приложение', 'en')).toBe('und')
  })

  it('tells Simplified from Traditional Chinese by the characters', () => {
    expect(detectLanguage('这个应用很好用', 'zh-Hant')).toBe('zh-Hans')
    expect(detectLanguage('這個應用很好用', 'zh-Hans')).toBe('zh-Hant')
    expect(detectLanguage('ChatGPT 写邮件很快', 'en')).toBe('zh-Hans')
  })

  it('lets the page decide when the characters cannot', () => {
    expect(detectLanguage('很好', 'zh-Hant')).toBe('zh-Hant')
    expect(detectLanguage('很好', 'zh-Hans')).toBe('zh-Hans')
    expect(detectLanguage('最高', 'ja')).toBe('ja')
    expect(detectLanguage('很好', 'en')).toBe('zh-Hans')
  })

  it("takes the page's language when there are no letters", () => {
    expect(detectLanguage('👍👍 10/10', 'ko')).toBe('ko')
  })
})
