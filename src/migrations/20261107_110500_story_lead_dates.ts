import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { dropLeadDate, dropLeadDates } from '../modules/daily/lead-date'

type Row = { id: number; summary: string; body: string | null; published_at: string | null }

/**
 * Stories the site wrote itself: drop an opening date that repeats the publish day from the
 * summary and the body's paragraphs (src/modules/daily/lead-date.ts; 2026-11-07 站长). Stories
 * imported from the editors' pipeline (raw item `feishu:…`) are left alone: the pipeline fixes
 * them at the source and imports them again, and the import drops such a date too.
 * Data only: no schema change, and down cannot bring the dates back.
 */
export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT l.id, l.summary, l.body, s.published_at
    FROM "stories_locales" l
    JOIN "stories" s ON s.id = l._parent_id
    JOIN "raw_items" r ON r.id = s.representative_item_id
    WHERE s.published_at IS NOT NULL AND coalesce(r.external_id, '') NOT LIKE 'feishu:%'`)
  let changed = 0
  for (const row of rows as Row[]) {
    const summary = dropLeadDate(row.summary, row.published_at)
    const body = row.body ? dropLeadDates(row.body, row.published_at) : row.body
    if (summary === row.summary && body === row.body) continue
    await db.execute(sql`UPDATE "stories_locales" SET "summary" = ${summary}, "body" = ${body} WHERE "id" = ${row.id}`)
    changed++
  }
  payload.logger.info(`story_lead_dates: dropped the opening date from ${changed} of ${rows.length} story texts`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
