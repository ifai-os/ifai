import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_circle_images_kind" AS ENUM('post', 'cover');
  CREATE TABLE "circle_videos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" text NOT NULL,
  	"video_key" text NOT NULL,
  	"url" text NOT NULL,
  	"title" text,
  	"channel" text,
  	"duration_seconds" integer,
  	"cover_id" integer,
  	"found" boolean DEFAULT false NOT NULL,
  	"requested_by" text,
  	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "circle_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_circle_images_kind" DEFAULT 'post' NOT NULL,
  	"uploader" varchar,
  	"post" numeric,
  	"circle" numeric,
  	"position" numeric,
  	"public" boolean DEFAULT false,
  	"prefix" varchar DEFAULT 'circles',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_square_url" varchar,
  	"sizes_square_width" numeric,
  	"sizes_square_height" numeric,
  	"sizes_square_mime_type" varchar,
  	"sizes_square_filesize" numeric,
  	"sizes_square_filename" varchar,
  	"sizes_feed_url" varchar,
  	"sizes_feed_width" numeric,
  	"sizes_feed_height" numeric,
  	"sizes_feed_mime_type" varchar,
  	"sizes_feed_filesize" numeric,
  	"sizes_feed_filename" varchar
  );
  
  ALTER TABLE "circle_posts" ADD COLUMN "video_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "circle_images_id" integer;
  ALTER TABLE "circle_videos" ADD CONSTRAINT "circle_videos_requested_by_auth_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "circle_videos_provider_key_idx" ON "circle_videos" USING btree ("provider","video_key");
  CREATE INDEX "circle_videos_requested_idx" ON "circle_videos" USING btree ("requested_by","created_at");
  CREATE INDEX "circle_images_kind_idx" ON "circle_images" USING btree ("kind");
  CREATE INDEX "circle_images_uploader_idx" ON "circle_images" USING btree ("uploader");
  CREATE INDEX "circle_images_post_idx" ON "circle_images" USING btree ("post");
  CREATE INDEX "circle_images_circle_idx" ON "circle_images" USING btree ("circle");
  CREATE INDEX "circle_images_public_idx" ON "circle_images" USING btree ("public");
  CREATE INDEX "circle_images_updated_at_idx" ON "circle_images" USING btree ("updated_at");
  CREATE INDEX "circle_images_created_at_idx" ON "circle_images" USING btree ("created_at");
  CREATE UNIQUE INDEX "circle_images_filename_idx" ON "circle_images" USING btree ("filename");
  CREATE INDEX "circle_images_sizes_square_sizes_square_filename_idx" ON "circle_images" USING btree ("sizes_square_filename");
  CREATE INDEX "circle_images_sizes_feed_sizes_feed_filename_idx" ON "circle_images" USING btree ("sizes_feed_filename");
  ALTER TABLE "circle_posts" ADD CONSTRAINT "circle_posts_video_id_circle_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."circle_videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_circle_images_fk" FOREIGN KEY ("circle_images_id") REFERENCES "public"."circle_images"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "circle_posts_video_idx" ON "circle_posts" USING btree ("video_id");
  CREATE INDEX "payload_locked_documents_rels_circle_images_id_idx" ON "payload_locked_documents_rels" USING btree ("circle_images_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "circle_videos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "circle_images" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "circle_videos" CASCADE;
  DROP TABLE "circle_images" CASCADE;
  ALTER TABLE "circle_posts" DROP CONSTRAINT IF EXISTS "circle_posts_video_id_circle_videos_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_circle_images_fk";
  
  DROP INDEX "circle_posts_video_idx";
  DROP INDEX "payload_locked_documents_rels_circle_images_id_idx";
  ALTER TABLE "circle_posts" DROP COLUMN "video_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "circle_images_id";
  DROP TYPE "public"."enum_circle_images_kind";`)
}
