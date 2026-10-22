import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_apps_draft_status" AS ENUM('pending', 'drafted', 'failed');
  ALTER TABLE "apps" ALTER COLUMN "primary_category_id" DROP NOT NULL;
  ALTER TABLE "apps" ADD COLUMN "draft_status" "enum_apps_draft_status";
  ALTER TABLE "apps" ADD COLUMN "draft_info" jsonb;
  CREATE INDEX "apps_draft_status_idx" ON "apps" USING btree ("draft_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "apps_draft_status_idx";
  ALTER TABLE "apps" ALTER COLUMN "primary_category_id" SET NOT NULL;
  ALTER TABLE "apps" DROP COLUMN "draft_status";
  ALTER TABLE "apps" DROP COLUMN "draft_info";
  DROP TYPE "public"."enum_apps_draft_status";`)
}
