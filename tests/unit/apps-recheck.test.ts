import { describe, expect, it } from 'vitest'

import { checkedAtOnSave, recheckCutoff, recheckDue, whereQuery } from '@/modules/apps/profile/recheck'

const now = new Date('2026-10-23T08:00:00.000Z')

describe('apps due for a profile check', () => {
  it('are the published ones checked, or never checked and listed, more than 90 days ago', () => {
    expect(recheckCutoff(now).toISOString()).toBe('2026-07-25T08:00:00.000Z')
    expect(recheckDue(now)).toEqual({
      and: [
        { status: { equals: 'published' } },
        {
          or: [
            { checkedAt: { less_than: '2026-07-25T08:00:00.000Z' } },
            { and: [{ checkedAt: { exists: false } }, { listedAt: { less_than: '2026-07-25T08:00:00.000Z' } }] },
          ],
        },
      ],
    })
  })

  it('go into the address the way the admin list and the REST API read it', () => {
    expect(whereQuery(recheckDue(now)).split('&')).toEqual([
      'where[and][0][status][equals]=published',
      'where[and][1][or][0][checkedAt][less_than]=2026-07-25T08%3A00%3A00.000Z',
      'where[and][1][or][1][and][0][checkedAt][exists]=false',
      'where[and][1][or][1][and][1][listedAt][less_than]=2026-07-25T08%3A00%3A00.000Z',
    ])
  })
})

describe('the profile check date on save', () => {
  const today = now.toISOString()

  it('is filled in when an app is published', () => {
    expect(checkedAtOnSave({ status: 'published' }, undefined, now)).toBe(today)
    expect(checkedAtOnSave({ status: 'published', checkedAt: null }, { status: 'draft', checkedAt: null }, now)).toBe(today)
    // Published again after being delisted: checked again.
    const old = '2026-01-10T12:00:00.000Z'
    expect(checkedAtOnSave({ status: 'published', checkedAt: old }, { status: 'delisted', checkedAt: old }, now)).toBe(today)
  })

  it('keeps a date set in the same save, and leaves other saves alone', () => {
    const set = '2026-10-20T12:00:00.000Z'
    expect(checkedAtOnSave({ status: 'published', checkedAt: set }, { status: 'draft', checkedAt: null }, now)).toBe(set)
    const old = '2026-01-10T12:00:00.000Z'
    expect(checkedAtOnSave({ status: 'published', checkedAt: old }, { status: 'published', checkedAt: old }, now)).toBe(old)
    expect(checkedAtOnSave({ status: 'draft', checkedAt: null }, { status: 'draft', checkedAt: null }, now)).toBeNull()
    // A partial update that doesn't touch the status.
    expect(checkedAtOnSave({}, { status: 'draft', checkedAt: null }, now)).toBeUndefined()
  })
})
