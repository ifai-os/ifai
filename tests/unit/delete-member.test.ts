import { getTableName, type SQL, type Table } from '@payloadcms/db-postgres/drizzle'
import { PgDialect, QueryBuilder } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { deleteMemberData } from '@/lib/auth/delete-member'

function fakePayload(remove = vi.fn().mockResolvedValue({ docs: [], errors: [] })) {
  const where = vi.fn<(condition: SQL) => Promise<unknown[]>>().mockResolvedValue([])
  const drizzleDelete = vi.fn((table: Table) => ({ table, where }))
  // Subqueries are built for real, without a database, so the SQL can be read.
  const queries = new QueryBuilder()
  const drizzle = { delete: drizzleDelete, select: queries.select.bind(queries) }
  return { payload: { delete: remove, db: { drizzle } } as unknown as Payload, remove, drizzleDelete, where }
}

describe('deleteMemberData', () => {
  it('deletes the member’s submissions and reports, whatever their status', async () => {
    const { payload, remove, drizzleDelete, where } = fakePayload()
    await deleteMemberData(payload, 'member-1')
    expect(remove.mock.calls.map(([options]) => options)).toEqual([
      { collection: 'app-submissions', where: { submitterId: { equals: 'member-1' } }, overrideAccess: true },
      { collection: 'skill-submissions', where: { submitterId: { equals: 'member-1' } }, overrideAccess: true },
      { collection: 'app-reports', where: { reporter: { equals: 'u:member-1' } }, overrideAccess: true },
    ])
    // Their reports of other members' reviews and posts, kept by `u:<id>` in app_review_reports and circle_post_reports.
    expect(drizzleDelete.mock.calls.map(([table]) => getTableName(table))).toEqual(['app_review_reports', 'circle_post_reports'])
    expect(where).toHaveBeenCalledTimes(2)
    // Their agents' reports of posts too, kept by `a:<agent id>`.
    const posts = new PgDialect().sqlToQuery(where.mock.calls[1][0])
    expect(posts.sql).toBe(
      `("circle_post_reports"."reporter" = $1 or "circle_post_reports"."reporter" in (select 'a:' || "id" from "agents" where "agents"."user_id" = $2))`,
    )
    expect(posts.params).toEqual(['u:member-1', 'member-1'])
  })

  it('stops at the first failure, so the account is kept and can be deleted again', async () => {
    const { payload, remove, drizzleDelete } = fakePayload(vi.fn().mockRejectedValue(new Error('database down')))
    await expect(deleteMemberData(payload, 'member-1')).rejects.toThrow('database down')
    expect(remove).toHaveBeenCalledTimes(1)
    expect(drizzleDelete).not.toHaveBeenCalled()
  })
})
