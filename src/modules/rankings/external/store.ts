import { createHash } from 'node:crypto'

import { and, desc, eq, inArray } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { externalRows, externalSnapshots } from '../schema'
import type { ExternalRow, ExternalSnapshot, ExternalSource } from './sources'

/**
 * Writes outside boards (docs/specs/rankings.md「外部榜单」): every published day is kept. A day
 * already stored with the same rows is left alone; a day whose rows changed (the source corrected
 * it) is replaced, so running the import again never duplicates anything.
 */

/** Fingerprint of a board's rows, field by field in a fixed order. */
export function rowsChecksum(rows: readonly ExternalRow[]): string {
  const hash = createHash('sha256')
  for (const row of rows) {
    hash.update(JSON.stringify([row.rank, row.model, row.org, row.license, row.weights, row.score, row.lower, row.upper, row.votes]))
    hash.update('\n')
  }
  return hash.digest('hex').slice(0, 32)
}

/** Rows per insert: 11 values each, well under Postgres's 65,535 parameters. */
const ROWS_PER_INSERT = 1000

export type StoreResult = { added: number; replaced: number; unchanged: number; latest: string | null }

/** Stores a board's published days; returns what changed and the newest day it now has. */
export async function storeSnapshots(source: ExternalSource, board: string, snapshots: readonly ExternalSnapshot[]): Promise<StoreResult> {
  const { db } = await getDb()
  const existing = await db
    .select({ id: externalSnapshots.id, publishedOn: externalSnapshots.publishedOn, checksum: externalSnapshots.checksum })
    .from(externalSnapshots)
    .where(and(eq(externalSnapshots.source, source), eq(externalSnapshots.board, board)))
  const byDay = new Map(existing.map((snapshot) => [snapshot.publishedOn, snapshot]))

  const changed = snapshots
    .filter((snapshot) => snapshot.rows.length > 0)
    .map((snapshot) => ({ ...snapshot, checksum: rowsChecksum(snapshot.rows), old: byDay.get(snapshot.publishedOn) }))
    .filter((snapshot) => snapshot.old?.checksum !== snapshot.checksum)
  const replaced = changed.flatMap((snapshot) => (snapshot.old ? [snapshot.old.id] : []))
  const days = [...existing.map((snapshot) => snapshot.publishedOn), ...snapshots.filter((snapshot) => snapshot.rows.length > 0).map((snapshot) => snapshot.publishedOn)]
  const latest = days.length ? days.reduce((a, b) => (a > b ? a : b)) : null
  if (changed.length === 0) return { added: 0, replaced: 0, unchanged: snapshots.length, latest }

  await db.transaction(async (tx) => {
    // The rows go with their day (on delete cascade).
    if (replaced.length) await tx.delete(externalSnapshots).where(inArray(externalSnapshots.id, replaced))
    const inserted = await tx
      .insert(externalSnapshots)
      .values(changed.map((snapshot) => ({ source, board, publishedOn: snapshot.publishedOn, models: snapshot.rows.length, checksum: snapshot.checksum })))
      .returning({ id: externalSnapshots.id, publishedOn: externalSnapshots.publishedOn })
    const idByDay = new Map(inserted.map((snapshot) => [snapshot.publishedOn, snapshot.id]))
    const rows = changed.flatMap((snapshot) =>
      snapshot.rows.map((row) => ({ snapshotId: idByDay.get(snapshot.publishedOn) as number, ...row })),
    )
    for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
      await tx.insert(externalRows).values(rows.slice(start, start + ROWS_PER_INSERT))
    }
  })
  return { added: changed.length - replaced.length, replaced: replaced.length, unchanged: snapshots.length - changed.length, latest }
}

/** A board's newest stored day and its fingerprint; null before the first import. */
export async function latestSnapshot(source: ExternalSource, board: string): Promise<{ publishedOn: string; checksum: string } | null> {
  const { db } = await getDb()
  const [row] = await db
    .select({ publishedOn: externalSnapshots.publishedOn, checksum: externalSnapshots.checksum })
    .from(externalSnapshots)
    .where(and(eq(externalSnapshots.source, source), eq(externalSnapshots.board, board)))
    .orderBy(desc(externalSnapshots.publishedOn))
    .limit(1)
  return row ?? null
}

/** Whether a board has any published day yet: the first import reads its whole history. */
export async function hasSnapshots(source: ExternalSource, board: string): Promise<boolean> {
  const { db } = await getDb()
  const [row] = await db
    .select({ id: externalSnapshots.id })
    .from(externalSnapshots)
    .where(and(eq(externalSnapshots.source, source), eq(externalSnapshots.board, board)))
    .limit(1)
  return Boolean(row)
}
