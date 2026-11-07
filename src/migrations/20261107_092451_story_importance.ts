import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" ADD COLUMN "sota" boolean DEFAULT false;
  ALTER TABLE "stories" ADD COLUMN "importance" numeric;
  ALTER TABLE "stories" ADD COLUMN "spread" numeric;
  CREATE INDEX "stories_spread_idx" ON "stories" USING btree ("spread");`)
  // Every story so far gets its importance from its category and AI score (none is marked SOTA
  // yet) and its reach index from both, as src/modules/daily/heat/importance.ts computes them.
  await db.execute(sql`
  UPDATE "stories" SET "importance" = round(least(95, greatest(20,
    (CASE "category"::text
      WHEN 'llm' THEN 60 WHEN 'open' THEN 55 WHEN 'industry' THEN 45 WHEN 'tools' THEN 40
      WHEN 'aigc' THEN 40 WHEN 'robotics' THEN 35 WHEN 'research' THEN 30 ELSE 45 END)
    + coalesce(("score" - 70) / 2.0, 0))));
  UPDATE "stories" SET "spread" = round(1000 * (1 - (1 - 0.6 * "importance" / 100.0)
    * (1 - least(100, greatest(0, coalesce("heat_peak", 0))) / 100.0))) / 10.0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "stories_spread_idx";
  ALTER TABLE "stories" DROP COLUMN "sota";
  ALTER TABLE "stories" DROP COLUMN "importance";
  ALTER TABLE "stories" DROP COLUMN "spread";`)
}
