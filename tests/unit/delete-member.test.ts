import { getTableName, type Table } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { deleteMemberData } from '@/lib/auth/delete-member'

function fakePayload(remove = vi.fn().mockResolvedValue({ docs: [], errors: [] })) {
  const where = vi.fn().mockResolvedValue([])
  const drizzleDelete = vi.fn((table: Table) => ({ table, where }))
  return { payload: { delete: remove, db: { drizzle: { delete: drizzleDelete } } } as unknown as Payload, remove, drizzleDelete, where }
}

describe('deleteMemberData', () => {
  it('deletes the member’s submissions, reports and pictures, whatever their status', async () => {
    const { payload, remove, drizzleDelete, where } = fakePayload()
    await deleteMemberData(payload, 'member-1')
    expect(remove.mock.calls.map(([options]) => options)).toEqual([
      { collection: 'app-submissions', where: { submitterId: { equals: 'member-1' } }, overrideAccess: true },
      { collection: 'skill-submissions', where: { submitterId: { equals: 'member-1' } }, overrideAccess: true },
      { collection: 'app-reports', where: { reporter: { equals: 'u:member-1' } }, overrideAccess: true },
      // Pictures for circle posts, posted or not; Payload deletes their files.
      { collection: 'circle-images', where: { uploader: { equals: 'member-1' } }, overrideAccess: true },
    ])
    // Their reports of other members' reviews, posts, comments and of other members, kept by `u:<id>`.
    expect(drizzleDelete.mock.calls.map(([table]) => getTableName(table))).toEqual([
      'app_review_reports',
      'circle_post_reports',
      'circle_comment_reports',
      'member_reports',
    ])
    expect(where).toHaveBeenCalledTimes(4)
  })

  it('stops at the first failure, so the account is kept and can be deleted again', async () => {
    const { payload, remove, drizzleDelete } = fakePayload(vi.fn().mockRejectedValue(new Error('database down')))
    await expect(deleteMemberData(payload, 'member-1')).rejects.toThrow('database down')
    expect(remove).toHaveBeenCalledTimes(1)
    expect(drizzleDelete).not.toHaveBeenCalled()
  })
})
