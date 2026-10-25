import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stories_media_kind" AS ENUM('none', 'image', 'video');
  ALTER TABLE "raw_items" ADD COLUMN "media" jsonb;
  ALTER TABLE "stories" ADD COLUMN "media_kind" "enum_stories_media_kind" DEFAULT 'none';
  ALTER TABLE "stories" ADD COLUMN "media_video_url" varchar;
  ALTER TABLE "stories" ADD COLUMN "media_image_id" integer;
  ALTER TABLE "stories" ADD COLUMN "media_credit" varchar;
  ALTER TABLE "stories" ADD CONSTRAINT "stories_media_image_id_media_id_fk" FOREIGN KEY ("media_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "stories_media_media_image_idx" ON "stories" USING btree ("media_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" DROP CONSTRAINT "stories_media_image_id_media_id_fk";
  
  DROP INDEX "stories_media_media_image_idx";
  ALTER TABLE "raw_items" DROP COLUMN "media";
  ALTER TABLE "stories" DROP COLUMN "media_kind";
  ALTER TABLE "stories" DROP COLUMN "media_video_url";
  ALTER TABLE "stories" DROP COLUMN "media_image_id";
  ALTER TABLE "stories" DROP COLUMN "media_credit";
  DROP TYPE "public"."enum_stories_media_kind";`)
}
