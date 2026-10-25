import { describe, expect, it } from 'vitest'

import { publishTime, sourceTime, stampPublishing } from '@/modules/daily/publish-time'
import type { Story } from '@/payload-types'

const approvedAt = new Date('2026-10-24T10:00:00.000Z')
const source = (role: 'original' | 'report' | 'discussion', publishedAt: string | null) => ({
  name: 'Lab',
  url: 'https://lab.example/post',
  role,
  publishedAt,
})

describe('the publish time', () => {
  it("is the original source's, else the earliest other source's", () => {
    expect(sourceTime([source('report', '2026-10-24T08:00:00.000Z'), source('original', '2026-10-24T09:00:00.000Z')], approvedAt)).toBe(
      '2026-10-24T09:00:00.000Z',
    )
    expect(
      sourceTime(
        [source('original', null), source('report', '2026-10-24T09:30:00.000Z'), source('report', '2026-10-24T08:30:00.000Z'), source('discussion', null)],
        approvedAt,
      ),
    ).toBe('2026-10-24T08:30:00.000Z')
    expect(sourceTime([source('original', null)], approvedAt)).toBeNull()
    expect(sourceTime(null, approvedAt)).toBeNull()
  })

  it('never comes after the approval', () => {
    // A source time after it is left out; a time the story came with is brought back to it.
    expect(sourceTime([source('original', '2026-10-24T11:00:00.000Z'), source('report', '2026-10-24T09:00:00.000Z')], approvedAt)).toBe(
      '2026-10-24T09:00:00.000Z',
    )
    expect(publishTime({ publishedAt: '2026-10-24T12:00:00.000Z', sources: [] }, approvedAt)).toBe(approvedAt.toISOString())
  })

  it('keeps the time a story came with, else takes its sources’, else the approval', () => {
    const sources = [source('original', '2026-10-24T09:00:00.000Z')]
    expect(publishTime({ publishedAt: '2026-09-01T00:00:00.000Z', sources }, approvedAt)).toBe('2026-09-01T00:00:00.000Z')
    expect(publishTime({ publishedAt: null, sources }, approvedAt)).toBe('2026-10-24T09:00:00.000Z')
    expect(publishTime({ publishedAt: null, sources: [] }, approvedAt)).toBe(approvedAt.toISOString())
  })
})

describe('a story going on the site', () => {
  const stamp = (data: Partial<Story>, originalDoc?: Partial<Story>) =>
    stampPublishing({ data, originalDoc, operation: originalDoc ? 'update' : 'create' } as Parameters<typeof stampPublishing>[0]) as Partial<Story>

  it('is stamped with its approval, and its time comes from its sources', () => {
    const before = Date.now()
    const stamped = stamp({ status: 'published' }, { status: 'pending', publishedAt: null, sources: [source('original', '2026-10-24T09:00:00.000Z')] })
    expect(Date.parse(stamped.approvedAt!)).toBeGreaterThanOrEqual(before)
    expect(stamped.publishedAt).toBe('2026-10-24T09:00:00.000Z')
  })

  it('keeps an imported time, and the first approval when it goes back up', () => {
    expect(stamp({ status: 'published', publishedAt: '2026-09-01T08:00:00.000Z', approvedAt: approvedAt.toISOString() })).toMatchObject({
      publishedAt: '2026-09-01T08:00:00.000Z',
      approvedAt: approvedAt.toISOString(),
    })
    expect(
      stamp({ status: 'published' }, { status: 'withdrawn', publishedAt: '2026-10-24T09:00:00.000Z', approvedAt: '2026-10-24T09:30:00.000Z' }),
    ).toMatchObject({ publishedAt: '2026-10-24T09:00:00.000Z', approvedAt: '2026-10-24T09:30:00.000Z' })
  })

  it('leaves other saves alone', () => {
    expect(stamp({ title: 'Edited' }, { status: 'published', publishedAt: '2026-10-24T09:00:00.000Z' })).toEqual({ title: 'Edited' })
    expect(stamp({ status: 'published' }, { status: 'published' })).toEqual({ status: 'published' })
    expect(stamp({ status: 'pending' })).toEqual({ status: 'pending' })
  })
})
