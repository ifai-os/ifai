import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { deleteMemberData } from '@/lib/auth/delete-member'

describe('deleteMemberData', () => {
  it('deletes the member’s app and Skill submissions, whatever their status', async () => {
    const remove = vi.fn().mockResolvedValue({ docs: [], errors: [] })
    await deleteMemberData({ delete: remove } as unknown as Payload, 'member-1')
    expect(remove.mock.calls.map(([options]) => options)).toEqual([
      { collection: 'app-submissions', where: { submitterId: { equals: 'member-1' } }, overrideAccess: true },
      { collection: 'skill-submissions', where: { submitterId: { equals: 'member-1' } }, overrideAccess: true },
    ])
  })

  it('stops at the first failure, so the account is kept and can be deleted again', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('database down'))
    await expect(deleteMemberData({ delete: remove } as unknown as Payload, 'member-1')).rejects.toThrow('database down')
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
