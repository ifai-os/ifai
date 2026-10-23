import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_skill_versions_draft_status" AS ENUM('pending', 'drafted', 'failed');
  ALTER TABLE "skill_versions" ADD COLUMN "draft_status" "enum_skill_versions_draft_status";
  ALTER TABLE "skill_versions" ADD COLUMN "draft_info" jsonb;
  ALTER TABLE "skill_versions" ADD COLUMN "readme" varchar;
  CREATE INDEX "skill_versions_draft_status_idx" ON "skill_versions" USING btree ("draft_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "skill_versions_draft_status_idx";
  ALTER TABLE "skill_versions" DROP COLUMN "draft_status";
  ALTER TABLE "skill_versions" DROP COLUMN "draft_info";
  ALTER TABLE "skill_versions" DROP COLUMN "readme";
  DROP TYPE "public"."enum_skill_versions_draft_status";`)
}
