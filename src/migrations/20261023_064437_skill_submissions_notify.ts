import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_skill_submissions_locale" AS ENUM('en', 'zh-Hans', 'zh-Hant', 'ja', 'ko');
  CREATE TYPE "public"."enum_skill_submissions_notified_status" AS ENUM('pending', 'accepted', 'rejected');
  ALTER TABLE "skill_submissions" ADD COLUMN "locale" "enum_skill_submissions_locale" DEFAULT 'en';
  ALTER TABLE "skill_submissions" ADD COLUMN "notified_status" "enum_skill_submissions_notified_status";
  ALTER TABLE "skill_submissions" ADD COLUMN "notified_at" timestamp(3) with time zone;
  ALTER TABLE "skill_submissions" ADD COLUMN "reply" varchar;`)
  // Submissions from before the emails existed count as told, so the hourly sweep does not write to them now.
  await db.execute(sql`
   UPDATE "skill_submissions" SET "notified_status" = "status"::text::"enum_skill_submissions_notified_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "skill_submissions" DROP COLUMN "locale";
  ALTER TABLE "skill_submissions" DROP COLUMN "notified_status";
  ALTER TABLE "skill_submissions" DROP COLUMN "notified_at";
  ALTER TABLE "skill_submissions" DROP COLUMN "reply";
  DROP TYPE "public"."enum_skill_submissions_locale";
  DROP TYPE "public"."enum_skill_submissions_notified_status";`)
}
