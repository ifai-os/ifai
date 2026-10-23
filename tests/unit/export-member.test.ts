import { createTranslator } from 'next-intl'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { locales, messagesFileName } from '@/i18n/config'
import { exportFileName } from '@/lib/auth/export-file'
import { readExportRefs, shapeMemberExport, type ExportRef, type ExportRefs, type MemberRecords } from '@/lib/auth/export-member'
import type { AppReport, AppSubmission, SkillSubmission, Subscriber } from '@/payload-types'

const site = 'https://ifai.example'
const now = new Date('2026-10-23T17:05:00.000Z')
const day = (date: string) => new Date(`${date}T08:00:00.000Z`)

/** What a careless query could have read along with the rows: none of it may reach the file. */
const secrets = {
  accessToken: 'secret-access-token',
  refreshToken: 'secret-refresh-token',
  idToken: 'secret-id-token',
  password: 'secret-password',
}
const sessionRows = [
  {
    id: 'session-now',
    createdAt: day('2026-10-23'),
    expiresAt: day('2026-10-30'),
    ipAddress: '203.0.113.5',
    userAgent: 'Firefox',
    token: 'secret-session-token',
  },
  { id: 'session-old', createdAt: day('2026-10-10'), expiresAt: day('2026-10-17'), ipAddress: null, userAgent: null, token: 'secret-old-token' },
]

function records(overrides: Partial<MemberRecords> = {}): MemberRecords {
  return {
    user: {
      id: 'member-1',
      email: 'reader@example.com',
      emailVerified: true,
      name: 'Reader',
      image: null,
      uiLocale: 'zh-Hans',
      createdAt: day('2026-10-01'),
      updatedAt: day('2026-10-02'),
    },
    accounts: [{ providerId: 'github', accountId: 'gh-42', scope: 'read:user,user:email', createdAt: day('2026-10-01'), ...secrets }],
    sessions: sessionRows,
    saves: [
      { targetType: 'app', targetId: 1, createdAt: day('2026-10-20') },
      { targetType: 'skill', targetId: 2, createdAt: day('2026-10-19') },
      { targetType: 'app', targetId: 99, createdAt: day('2026-10-17') },
    ],
    reviews: [
      { id: 10, appId: 1, rating: 5, body: 'Great for notes', lang: 'en', status: 'shown', editedAt: null, createdAt: day('2026-10-21') },
      { id: 11, appId: 1, rating: 3, body: 'Edited since', lang: 'en', status: 'hidden', editedAt: day('2026-10-22'), createdAt: day('2026-10-20') },
      { id: 12, appId: 99, rating: 4, body: 'Not translated', lang: 'en', status: 'shown', editedAt: null, createdAt: day('2026-10-19') },
    ],
    translations: [
      { reviewId: 10, source: 'Great for notes', status: 'done', texts: { 'zh-Hans': '记笔记很好用' } },
      { reviewId: 11, source: 'The words before the edit', status: 'done', texts: { 'zh-Hans': '改之前的话' } },
      { reviewId: 12, source: 'Not translated', status: 'failed', texts: {} },
    ],
    reviewReports: [{ reviewId: 50, appId: 1, reason: 'spam', createdAt: day('2026-10-22'), resolvedAt: null }],
    appReports: [
      {
        id: 7,
        app: 1,
        kind: 'wrong-info',
        body: 'The price is wrong',
        contact: 'reader@example.com',
        pageLocale: 'en',
        reporter: 'u:member-1',
        status: 'resolved',
        resolvedAt: '2026-10-22T09:00:00.000Z',
        updatedAt: '2026-10-22T09:00:00.000Z',
        createdAt: '2026-10-21T09:00:00.000Z',
      } satisfies AppReport,
    ],
    appSubmissions: [
      {
        id: 3,
        code: 'A-0003',
        status: 'rejected',
        app: null,
        locale: 'en',
        notifiedStatus: 'rejected',
        notifiedAt: '2026-10-22T10:00:00.000Z',
        name: 'Notes AI',
        website: 'https://notes.example',
        domain: 'notes.example',
        category: 3,
        note: 'Please add it',
        email: 'reader@example.com',
        submitterId: 'member-1',
        reply: 'It is not an AI product.',
        adminNote: 'internal: looked spammy',
        updatedAt: '2026-10-22T10:00:00.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
      } satisfies AppSubmission,
    ],
    skillSubmissions: [
      {
        id: 4,
        code: 'S-0004',
        status: 'accepted',
        skill: 2,
        locale: 'zh-Hans',
        notifiedStatus: null,
        notifiedAt: null,
        repository: 'https://github.com/reader/skill',
        note: null,
        email: 'reader@example.com',
        submitterId: 'member-1',
        reply: null,
        adminNote: 'internal: scan was clean',
        updatedAt: '2026-10-21T10:00:00.000Z',
        createdAt: '2026-10-21T09:00:00.000Z',
      } satisfies SkillSubmission,
    ],
    subscriber: {
      id: 5,
      email: 'reader@example.com',
      locale: 'zh-Hans',
      timeZone: 'Asia/Shanghai',
      status: 'subscribed',
      stopReason: null,
      sourcePage: '/zh-hans/daily',
      subscribedAt: '2026-10-05T01:00:00.000Z',
      unsubscribedAt: null,
      welcomeSentAt: '2026-10-05T01:00:05.000Z',
      lastSentAt: '2026-10-23T00:00:00.000Z',
      updatedAt: '2026-10-23T00:00:00.000Z',
      createdAt: '2026-10-05T01:00:00.000Z',
    } satisfies Subscriber,
    sends: [
      { localDate: '2026-10-23', locale: 'zh-Hans', status: 'sent', storyCount: 8, sentAt: day('2026-10-23') },
      { localDate: '2026-10-22', locale: 'zh-Hans', status: 'failed', storyCount: null, sentAt: null },
    ],
    ...overrides,
  }
}

const refs: ExportRefs = {
  app: new Map([[1, { id: 1, name: 'Notion', url: `${site}/en/apps/notion` }]]),
  skill: new Map([[2, { id: 2, name: 'PDF reader', url: `${site}/en/resources/skills/pdf-reader` }]]),
  category: new Map([[3, { id: 3, name: 'Writing', url: `${site}/en/apps/category/writing` }]]),
  story: new Map(),
}

const shape = (input: MemberRecords, sessionId: string | null = 'session-now') =>
  shapeMemberExport(input, refs, { about: 'About this file', site, sessionId, now })

describe('shapeMemberExport', () => {
  it('leaves out sign-in tokens and the owner’s internal notes, whatever the records carry', () => {
    const file = JSON.stringify(shape(records()))
    expect(file).not.toContain('secret')
    expect(file).not.toContain('internal:')
    expect(file).not.toContain('session-now')
    expect(file).not.toContain('adminNote')
  })

  it('marks the session the export was made from', () => {
    const { sessions } = shape(records())
    expect(sessions.map((session) => session.current)).toEqual([true, false])
    expect(sessions[0]).toEqual({
      signedInAt: '2026-10-23T08:00:00.000Z',
      expiresAt: '2026-10-30T08:00:00.000Z',
      ipAddress: '203.0.113.5',
      userAgent: 'Firefox',
      current: true,
    })
    expect(shape(records(), null).sessions.some((session) => session.current)).toBe(false)
  })

  it('names what the saves point at, and keeps only the id of what is gone', () => {
    expect(shape(records()).saves).toEqual([
      { type: 'app', id: 1, name: 'Notion', url: `${site}/en/apps/notion`, savedAt: '2026-10-20T08:00:00.000Z' },
      { type: 'skill', id: 2, name: 'PDF reader', url: `${site}/en/resources/skills/pdf-reader`, savedAt: '2026-10-19T08:00:00.000Z' },
      { type: 'app', id: 99, name: null, url: null, savedAt: '2026-10-17T08:00:00.000Z' },
    ])
  })

  it('gives a review’s machine translations only when they are of its current words', () => {
    const { reviews } = shape(records())
    expect(reviews.map((review) => review.machineTranslations)).toEqual([{ 'zh-Hans': '记笔记很好用' }, null, null])
    expect(reviews[1]).toMatchObject({ status: 'hidden', editedAt: '2026-10-22T08:00:00.000Z' })
  })

  it('keeps a reported review to its id and app, not someone else’s words', () => {
    expect(shape(records()).reviewReports).toEqual([
      { review: 50, app: refs.app.get(1), reason: 'spam', reportedAt: '2026-10-22T08:00:00.000Z', resolvedAt: null },
    ])
  })

  it('carries the reply to the submitter, the last result email and the linked Skill', () => {
    const { appSubmissions, skillSubmissions, appReports } = shape(records())
    expect(appSubmissions[0]).toMatchObject({
      code: 'A-0003',
      category: refs.category.get(3),
      app: null,
      replyFromIFAI: 'It is not an AI product.',
      lastEmail: { status: 'rejected', sentAt: '2026-10-22T10:00:00.000Z' },
    })
    expect(skillSubmissions[0]).toMatchObject({ skill: refs.skill.get(2), replyFromIFAI: null, lastEmail: null })
    expect(appReports[0]).toMatchObject({ app: refs.app.get(1), details: 'The price is wrong', status: 'resolved' })
  })

  it('includes the daily email subscription and its sends, or null when there is none', () => {
    expect(shape(records()).dailyEmail).toMatchObject({
      email: 'reader@example.com',
      status: 'subscribed',
      timeZone: 'Asia/Shanghai',
      subscribedFrom: '/zh-hans/daily',
      emails: [
        { date: '2026-10-23', language: 'zh-Hans', status: 'sent', stories: 8, sentAt: '2026-10-23T08:00:00.000Z' },
        { date: '2026-10-22', language: 'zh-Hans', status: 'failed', stories: null, sentAt: null },
      ],
    })
    expect(shape(records({ subscriber: null, sends: [] })).dailyEmail).toBeNull()
  })
})

describe('readExportRefs', () => {
  const docs: Record<string, object[]> = {
    apps: [
      { id: 1, name: 'Notion', slug: 'notion', status: 'published' },
      { id: 8, name: 'Old app', slug: 'old-app', status: 'delisted' },
    ],
    skills: [{ id: 2, name: 'PDF reader', slug: 'pdf-reader', status: 'delisted' }],
    'app-categories': [{ id: 3, name: 'Writing', slug: 'writing' }],
  }

  it('looks each kind up once, in the page language, with addresses only for pages readers can open', async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) => ({ docs: docs[collection] }))
    const payload = { find } as unknown as Payload
    const input = records({ saves: [{ targetType: 'app', targetId: 8, createdAt: day('2026-10-20') }] })
    const found = await readExportRefs(payload, input, 'ja', site)

    expect(find).toHaveBeenCalledTimes(3)
    for (const [options] of find.mock.calls) expect(options).toMatchObject({ locale: 'ja', overrideAccess: true, depth: 0 })
    const ids = Object.fromEntries(
      find.mock.calls.map(([options]) => [options.collection, (options as unknown as { where: { id: { in: number[] } } }).where.id.in]),
    )
    expect(ids).toEqual({ apps: [8, 1, 99], skills: [2], 'app-categories': [3] })

    const ref = (map: Map<number, ExportRef>, id: number) => map.get(id)
    expect(ref(found.app, 1)).toEqual({ id: 1, name: 'Notion', url: `${site}/ja/apps/notion` })
    // A delisted app is a 404; a delisted Skill keeps its page.
    expect(ref(found.app, 8)).toEqual({ id: 8, name: 'Old app', url: null })
    expect(ref(found.skill, 2)).toEqual({ id: 2, name: 'PDF reader', url: `${site}/ja/resources/skills/pdf-reader` })
    expect(ref(found.category, 3)).toEqual({ id: 3, name: 'Writing', url: `${site}/ja/apps/category/writing` })
  })

  it('reads nothing for a member with nothing to name', async () => {
    const find = vi.fn()
    const empty = records({ saves: [], reviews: [], reviewReports: [], appReports: [], appSubmissions: [], skillSubmissions: [] })
    const found = await readExportRefs({ find } as unknown as Payload, empty, 'en', site)
    expect(find).not.toHaveBeenCalled()
    expect(found.app.size + found.skill.size + found.category.size).toBe(0)
  })
})

describe('the file’s first line', () => {
  it('names the account, the time and the privacy policy in every language', async () => {
    for (const locale of locales) {
      const messages = (await import(`../../messages/${messagesFileName(locale)}.json`)).default
      const t = createTranslator({ locale, messages, namespace: 'account' })
      const about = t('exportAbout', { email: 'reader@example.com', time: '2026-10-23 17:05 UTC', url: `${site}/privacy` })
      expect(about).toContain('reader@example.com')
      expect(about).toContain('2026-10-23 17:05 UTC')
      expect(about).toContain(`${site}/privacy`)
    }
  })
})

describe('exportFileName', () => {
  it('is named after the day', () => {
    expect(exportFileName('2026-10-24')).toBe('ifai-data-2026-10-24.json')
  })
})
