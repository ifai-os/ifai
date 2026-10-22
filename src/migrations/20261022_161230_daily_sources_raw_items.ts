import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { defaultSources } from '../modules/daily/default-sources'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sources_type" AS ENUM('rss', 'html_list', 'json');
  CREATE TYPE "public"."enum_sources_tier" AS ENUM('T1', 'T1_5', 'T2');
  CREATE TYPE "public"."enum_sources_use" AS ENUM('editorial', 'roundup', 'hot_signal');
  CREATE TABLE "raw_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_id" integer NOT NULL,
  	"url" text NOT NULL,
  	"title" text NOT NULL,
  	"summary" text,
  	"content" text,
  	"links" jsonb,
  	"language" text DEFAULT 'en' NOT NULL,
  	"published_at" timestamp with time zone,
  	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"external_id" text,
  	"discussion_url" text,
  	"signals" jsonb,
  	"status" text DEFAULT 'fresh' NOT NULL,
  	"content_status" text DEFAULT 'pending' NOT NULL,
  	"content_error" text,
  	"content_fetched_at" timestamp with time zone,
  	"embedding" vector(1536)
  );
  
  CREATE TABLE "sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_sources_type" DEFAULT 'rss' NOT NULL,
  	"tier" "enum_sources_tier" DEFAULT 'T2' NOT NULL,
  	"use" "enum_sources_use" DEFAULT 'editorial' NOT NULL,
  	"url" varchar NOT NULL,
  	"homepage" varchar,
  	"config" jsonb,
  	"interval_minutes" numeric DEFAULT 60 NOT NULL,
  	"notes" varchar,
  	"enabled" boolean DEFAULT true,
  	"last_fetched_at" timestamp(3) with time zone,
  	"last_success_at" timestamp(3) with time zone,
  	"next_fetch_at" timestamp(3) with time zone,
  	"first_fetched_at" timestamp(3) with time zone,
  	"last_item_count" numeric,
  	"items_last7_days" numeric,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sources_id" integer;
  CREATE UNIQUE INDEX "raw_items_url_idx" ON "raw_items" USING btree ("url");
  CREATE INDEX "raw_items_source_discovered_idx" ON "raw_items" USING btree ("source_id","discovered_at");
  CREATE INDEX "raw_items_status_discovered_idx" ON "raw_items" USING btree ("status","discovered_at");
  CREATE INDEX "raw_items_published_at_idx" ON "raw_items" USING btree ("published_at");
  CREATE INDEX "raw_items_embedding_idx" ON "raw_items" USING hnsw ("embedding" vector_cosine_ops);
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");`)

  // Written by hand: raw_items belong to a source, and go with it when the source is deleted.
  await db.execute(sql`
   ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;`)

  // The first batch of sources (docs/specs/daily.md「信源」); edited in /admin from here on.
  for (const source of defaultSources) {
    await payload.create({ collection: 'sources', data: source, req })
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered by hand: dropping the collection tables with CASCADE already removes the
  // lock-table constraints, so the generated order (tables first) failed on DROP CONSTRAINT.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sources_fk";
  DROP INDEX "payload_locked_documents_rels_sources_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sources_id";
  ALTER TABLE "raw_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sources" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "raw_items" CASCADE;
  DROP TABLE "sources" CASCADE;
  DROP TYPE "public"."enum_sources_type";
  DROP TYPE "public"."enum_sources_tier";
  DROP TYPE "public"."enum_sources_use";`)
}
