import { describe, expect, it } from 'vitest'

import { shanghaiDate, shanghaiWorkingDaysAfter } from '@/lib/shanghai-day'
import { submitHref } from '@/modules/apps/list-params'
import { buildSubmissionEmail } from '@/modules/apps/submissions/email'
import {
  nameFromQuery,
  nextSubmissionSequence,
  parseAppSubmissionInput,
  reviewDeadline,
  submissionCode,
  submissionRules,
  submittedWebsite,
} from '@/modules/apps/submissions/rules'

const submission = { website: 'https://kimi.com', name: 'Kimi Slides', category: 3, note: 'Turns a document into slides', email: 'dev@example.com', locale: 'ja' }

describe('parseAppSubmissionInput', () => {
  it('tidies a good submission and finds its domain', () => {
    expect(
      parseAppSubmissionInput({ ...submission, website: ' www.Kimi.com/slides?utm_source=toolify&ref=x#top ', name: ' Kimi\n Slides ', email: ' Dev@Example.com ' }),
    ).toEqual({
      ok: true,
      value: {
        website: 'https://www.kimi.com/slides',
        domain: 'kimi.com',
        name: 'Kimi Slides',
        category: 3,
        note: 'Turns a document into slides',
        email: 'dev@example.com',
        locale: 'ja',
      },
    })
  })

  it('takes the category from the form as text, and leaves it out when there is none', () => {
    expect(parseAppSubmissionInput({ ...submission, category: '7' })).toMatchObject({ ok: true, value: { category: 7 } })
    expect(parseAppSubmissionInput({ ...submission, category: '' })).toMatchObject({ ok: true, value: { category: null } })
    expect(parseAppSubmissionInput({ ...submission, category: 'design' })).toMatchObject({ ok: true, value: { category: null } })
  })

  it('names every field that is not right', () => {
    expect(parseAppSubmissionInput({ website: 'not a site', name: ' ', note: 'x'.repeat(submissionRules.maxNote + 1), email: 'dev@' })).toEqual({
      ok: false,
      fields: ['website', 'name', 'note', 'email'],
    })
    expect(parseAppSubmissionInput(null)).toEqual({ ok: false, fields: ['website', 'name', 'email'] })
  })

  it('counts the name and the note in characters, Chinese and emoji included', () => {
    expect(parseAppSubmissionInput({ ...submission, name: '应'.repeat(submissionRules.maxName) }).ok).toBe(true)
    expect(parseAppSubmissionInput({ ...submission, name: '应'.repeat(submissionRules.maxName + 1) })).toEqual({ ok: false, fields: ['name'] })
    expect(parseAppSubmissionInput({ ...submission, note: '🙂'.repeat(submissionRules.maxNote) }).ok).toBe(true)
    expect(parseAppSubmissionInput({ ...submission, note: '' })).toMatchObject({ ok: true, value: { note: '' } })
  })

  it('falls back to English for an unknown language', () => {
    expect(parseAppSubmissionInput({ ...submission, locale: 'zh-hans' })).toMatchObject({ ok: true, value: { locale: 'en' } })
  })
})

describe('submittedWebsite', () => {
  it('keeps a public website', () => {
    expect(submittedWebsite('kitecode.example/')).toEqual({ website: 'https://kitecode.example', domain: 'kitecode.example' })
    expect(submittedWebsite('http://例子.中国')).toEqual({ website: 'http://xn--fsqu00a.xn--fiqs8s', domain: 'xn--fsqu00a.xn--fiqs8s' })
  })

  it('turns down what is not a public website', () => {
    for (const value of ['', 'localhost:3000', 'https://127.0.0.1', 'http://[::1]/', 'https://169.254.169.254/latest', 'javascript:alert(1)', 'ftp://kimi.com', `https://kimi.com/${'a'.repeat(2000)}`]) {
      expect(submittedWebsite(value), value).toBeNull()
    }
  })
})

describe('submission numbers', () => {
  it('continue after the highest number on that date', () => {
    expect(nextSubmissionSequence([])).toBe(1)
    expect(nextSubmissionSequence(['A-1021-01', 'A-1021-07', null])).toBe(8)
    expect(nextSubmissionSequence(['S-1021-09', 'nope'])).toBe(1)
  })

  it('use the Shanghai date', () => {
    expect(submissionCode(new Date('2026-10-21T16:30:00Z'), 7)).toBe('A-1022-07')
    expect(submissionCode(new Date('2026-10-21T15:30:00Z'), 112)).toBe('A-1021-112')
  })
})

describe('the review date the page promises', () => {
  it('is two Shanghai working days later', () => {
    const by = (sent: string) => shanghaiDate(reviewDeadline(new Date(sent)))
    expect(by('2026-10-21T06:52:00+08:00')).toBe('2026-10-23') // Wednesday → Friday
    expect(by('2026-10-23T23:30:00+08:00')).toBe('2026-10-27') // Friday night → Tuesday
    expect(by('2026-10-25T10:00:00+08:00')).toBe('2026-10-27') // Sunday → Tuesday
    expect(by('2026-10-22T17:30:00Z')).toBe('2026-10-27') // already Friday in Shanghai
  })

  it('counts any number of working days', () => {
    const from = new Date('2026-10-23T09:00:00+08:00')
    expect(shanghaiDate(shanghaiWorkingDaysAfter(from, 0))).toBe('2026-10-23')
    expect(shanghaiDate(shanghaiWorkingDaysAfter(from, 1))).toBe('2026-10-26')
    expect(shanghaiDate(shanghaiWorkingDaysAfter(from, 5))).toBe('2026-10-30')
  })
})

describe('the name a search passes on', () => {
  it('is one line, cut to the longest name', () => {
    expect(nameFromQuery(' kimi\n slides ')).toBe('kimi slides')
    expect(nameFromQuery(['first', 'second'])).toBe('first')
    expect(nameFromQuery(undefined)).toBe('')
    expect(nameFromQuery('名'.repeat(submissionRules.maxName + 5))).toHaveLength(submissionRules.maxName)
  })

  it('goes into the address of the submit page', () => {
    expect(submitHref()).toBe('/apps/submit')
    expect(submitHref('Kimi Slides & co')).toBe('/apps/submit?name=Kimi+Slides+%26+co')
  })
})

describe('submission emails', () => {
  const base = { code: 'A-1021-07', name: 'Kimi Slides' }

  it('confirms a new submission in its language', async () => {
    const email = await buildSubmissionEmail({ ...base, status: 'pending', locale: 'zh-Hans' })
    expect(email.subject).toBe('已收到你提交的应用（A-1021-07）')
    expect(email.html).toContain('lang="zh-Hans"')
    expect(email.text).toContain('谢谢你提交 Kimi Slides')
    expect(email.text).toContain('提交编号 A-1021-07')
    expect(email.html).not.toContain('/apps/')
  })

  it('links the listed app’s page, by the name it was listed under', async () => {
    const email = await buildSubmissionEmail({ ...base, status: 'accepted', locale: 'ja', app: { slug: 'kimi', name: 'Kimi' } })
    expect(email.subject).toBe('Kimi をIFAIに掲載しました（A-1021-07）')
    expect(email.html).toMatch(/href="https?:\/\/[^"]+\/ja\/apps\/kimi"/)
  })

  it('points a duplicate at the app that is already listed', async () => {
    const email = await buildSubmissionEmail({ ...base, status: 'duplicate', locale: 'en', app: { slug: 'kimi', name: 'Kimi' } })
    expect(email.subject).toBe('About the app you submitted (A-1021-07)')
    expect(email.text).toContain('Kimi is already in the AI Apps list')
    expect(email.html).toMatch(/href="https?:\/\/[^"]+\/en\/apps\/kimi"/)
  })

  it('quotes the owner’s note when an app is not listed, escaped', async () => {
    const email = await buildSubmissionEmail({ ...base, status: 'rejected', locale: 'ko', reply: 'Not an <b>AI</b> app yet' })
    expect(email.subject).toBe('제출해 주신 앱에 대해(A-1021-07)')
    expect(email.text).toContain('IFAI 팀의 메모:')
    expect(email.html).toContain('Not an &lt;b&gt;AI&lt;/b&gt; app yet')
    expect(email.html).not.toContain('/apps/')
  })
})
