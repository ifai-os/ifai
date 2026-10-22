import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" ADD COLUMN "later_at" timestamp(3) with time zone;
  ALTER TABLE "stories" ADD COLUMN "merged_into" numeric;
  ALTER TABLE "stories" ADD COLUMN "kept_apart_from" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" DROP COLUMN "later_at";
  ALTER TABLE "stories" DROP COLUMN "merged_into";
  ALTER TABLE "stories" DROP COLUMN "kept_apart_from";`)
}
