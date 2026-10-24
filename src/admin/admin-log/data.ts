/**
 * Reads for the admin log page (docs/specs/foundation.md「后台 · 操作记录」): one page of
 * `admin_log`, newest first, and the admins who appear in it for the filter.
 */
import { and, count, desc, eq, isNotNull, type SQL } from '@payloadcms/db-postgres/drizzle'

import type { LogDetail, LogKind } from '@/lib/admin-log/rules'
import { adminLog as t } from '@/lib/admin-log/schema'
import { getDb } from '@/lib/db/drizzle'

import { PAGE_SIZE, type LogFilters } from './rules'

export type LogRow = {
  id: number
  at: string
  adminId: number | null
  adminEmail: string | null
  kind: LogKind
  action: string | null
  collection: string | null
  docId: string | null
  docTitle: string | null
  detail: LogDetail
}

export type AdminLogPage = {
  rows: LogRow[]
  total: number
  pages: number
  admins: { id: number; email: string }[]
}

export async function loadAdminLog(filters: LogFilters): Promise<AdminLogPage> {
  const { db } = await getDb()
  const where: SQL[] = []
  if (filters.collection) where.push(eq(t.collection, filters.collection))
  if (filters.collection && filters.doc) where.push(eq(t.docId, filters.doc))
  if (filters.admin) where.push(eq(t.adminId, Number(filters.admin)))
  if (filters.kind) where.push(eq(t.kind, filters.kind))
  const condition = where.length ? and(...where) : undefined

  const [rows, [{ total }], admins] = await Promise.all([
    db
      .select()
      .from(t)
      .where(condition)
      .orderBy(desc(t.at), desc(t.id))
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(t).where(condition),
    db
      .selectDistinctOn([t.adminId], { id: t.adminId, email: t.adminEmail })
      .from(t)
      .where(isNotNull(t.adminId))
      .orderBy(t.adminId, desc(t.at)),
  ])

  return {
    rows: rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      adminId: row.adminId,
      adminEmail: row.adminEmail,
      kind: row.kind,
      action: row.action,
      collection: row.collection,
      docId: row.docId,
      docTitle: row.docTitle,
      detail: row.detail ?? {},
    })),
    total: Number(total),
    pages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)),
    admins: admins.flatMap((admin) => (admin.id === null ? [] : [{ id: admin.id, email: admin.email ?? `#${admin.id}` }])),
  }
}
