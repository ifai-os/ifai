import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "article_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"article_id" integer NOT NULL,
  	"reporter" text NOT NULL,
  	"reason" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"resolved_at" timestamp with time zone
  );
  
  CREATE TABLE "article_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"uploader" varchar NOT NULL,
  	"article" numeric,
  	"public" boolean DEFAULT false,
  	"prefix" varchar DEFAULT 'articles',
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
  	"sizes_thumb_url" varchar,
  	"sizes_thumb_width" numeric,
  	"sizes_thumb_height" numeric,
  	"sizes_thumb_mime_type" varchar,
  	"sizes_thumb_filesize" numeric,
  	"sizes_thumb_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  ALTER TABLE "articles" ADD COLUMN "cover_image_id" integer;
  ALTER TABLE "articles" ADD COLUMN "author" varchar;
  ALTER TABLE "articles" ADD COLUMN "markdown" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "article_images_id" integer;
  CREATE UNIQUE INDEX "article_reports_article_reporter_idx" ON "article_reports" USING btree ("article_id","reporter");
  CREATE INDEX "article_reports_resolved_idx" ON "article_reports" USING btree ("resolved_at");
  CREATE INDEX "article_images_uploader_idx" ON "article_images" USING btree ("uploader");
  CREATE INDEX "article_images_article_idx" ON "article_images" USING btree ("article");
  CREATE INDEX "article_images_public_idx" ON "article_images" USING btree ("public");
  CREATE INDEX "article_images_updated_at_idx" ON "article_images" USING btree ("updated_at");
  CREATE INDEX "article_images_created_at_idx" ON "article_images" USING btree ("created_at");
  CREATE UNIQUE INDEX "article_images_filename_idx" ON "article_images" USING btree ("filename");
  CREATE INDEX "article_images_sizes_thumb_sizes_thumb_filename_idx" ON "article_images" USING btree ("sizes_thumb_filename");
  CREATE INDEX "article_images_sizes_card_sizes_card_filename_idx" ON "article_images" USING btree ("sizes_card_filename");
  ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_image_id_article_images_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."article_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_article_images_fk" FOREIGN KEY ("article_images_id") REFERENCES "public"."article_images"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_cover_image_idx" ON "articles" USING btree ("cover_image_id");
  CREATE INDEX "articles_author_idx" ON "articles" USING btree ("author");
  CREATE INDEX "payload_locked_documents_rels_article_images_id_idx" ON "payload_locked_documents_rels" USING btree ("article_images_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "article_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "article_images" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "article_reports" CASCADE;
  DROP TABLE "article_images" CASCADE;
  ALTER TABLE "articles" DROP CONSTRAINT "articles_cover_image_id_article_images_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_article_images_fk";
  
  DROP INDEX "articles_cover_image_idx";
  DROP INDEX "articles_author_idx";
  DROP INDEX "payload_locked_documents_rels_article_images_id_idx";
  ALTER TABLE "articles" DROP COLUMN "cover_image_id";
  ALTER TABLE "articles" DROP COLUMN "author";
  ALTER TABLE "articles" DROP COLUMN "markdown";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "article_images_id";`)
}
