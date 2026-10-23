import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stories_heat_trend" AS ENUM('rising', 'new');
  CREATE TABLE "hot_signals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"item_id" integer NOT NULL,
  	"source_id" integer NOT NULL,
  	"points" integer DEFAULT 0 NOT NULL,
  	"comments" integer DEFAULT 0 NOT NULL,
  	"discussion_url" text,
  	"posted_at" timestamp with time zone NOT NULL,
  	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "events" ADD COLUMN "heat_before" real DEFAULT 0 NOT NULL;
  ALTER TABLE "event_items" ADD COLUMN "matched_item_id" integer;
  ALTER TABLE "stories" ADD COLUMN "heat_trend" "enum_stories_heat_trend";
  ALTER TABLE "stories" ADD COLUMN "sources_seen" jsonb;
  ALTER TABLE "hot_signals" ADD CONSTRAINT "hot_signals_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "hot_signals_item_source_idx" ON "hot_signals" USING btree ("item_id","source_id");
  CREATE INDEX "hot_signals_posted_idx" ON "hot_signals" USING btree ("posted_at");
  ALTER TABLE "event_items" ADD CONSTRAINT "event_items_matched_item_id_raw_items_id_fk" FOREIGN KEY ("matched_item_id") REFERENCES "public"."raw_items"("id") ON DELETE set null ON UPDATE no action;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "hot_signals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "hot_signals" CASCADE;
  ALTER TABLE "event_items" DROP CONSTRAINT "event_items_matched_item_id_raw_items_id_fk";
  
  ALTER TABLE "events" DROP COLUMN "heat_before";
  ALTER TABLE "event_items" DROP COLUMN "matched_item_id";
  ALTER TABLE "stories" DROP COLUMN "heat_trend";
  ALTER TABLE "stories" DROP COLUMN "sources_seen";
  DROP TYPE "public"."enum_stories_heat_trend";`)
}
