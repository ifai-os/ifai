import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stories_sources_role" AS ENUM('original', 'report', 'discussion');
  CREATE TYPE "public"."enum_stories_category" AS ENUM('product', 'industry', 'open', 'design', 'research');
  CREATE TYPE "public"."enum_stories_status" AS ENUM('pending', 'published', 'rejected', 'merged', 'withdrawn');
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"representative_item_id" integer NOT NULL,
  	"title" text NOT NULL,
  	"category" text NOT NULL,
  	"first_seen_at" timestamp with time zone NOT NULL,
  	"last_seen_at" timestamp with time zone NOT NULL,
  	"heat" real DEFAULT 0 NOT NULL,
  	"heat_updated_at" timestamp with time zone,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "event_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer NOT NULL,
  	"item_id" integer NOT NULL,
  	"relation" text NOT NULL,
  	"new_information" boolean DEFAULT false NOT NULL,
  	"added_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "item_analyses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"item_id" integer NOT NULL,
  	"stage" text DEFAULT 'pending' NOT NULL,
  	"outcome" text DEFAULT 'pending' NOT NULL,
  	"outcome_reason" text,
  	"prompt_versions" jsonb,
  	"relevant" boolean,
  	"relevance_reason" text,
  	"score_a" integer,
  	"score_b" integer,
  	"score_average" real,
  	"score_threshold" integer,
  	"score_reasons" jsonb,
  	"structure" jsonb,
  	"event_id" integer,
  	"relation" text,
  	"flags" jsonb,
  	"error" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "stories_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" "enum_stories_sources_role" DEFAULT 'report' NOT NULL,
  	"url" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "stories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"category" "enum_stories_category" NOT NULL,
  	"status" "enum_stories_status" DEFAULT 'pending' NOT NULL,
  	"event_id" numeric NOT NULL,
  	"representative_item_id" numeric NOT NULL,
  	"score" numeric,
  	"heat" numeric,
  	"flags" jsonb,
  	"verification" jsonb,
  	"locale_status" jsonb,
  	"prompt_version" varchar,
  	"published_at" timestamp(3) with time zone,
  	"corrected_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "stories_locales" (
  	"title" varchar NOT NULL,
  	"summary" varchar NOT NULL,
  	"try_it" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stories_id" integer;
  ALTER TABLE "events" ADD CONSTRAINT "events_representative_item_id_raw_items_id_fk" FOREIGN KEY ("representative_item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_items" ADD CONSTRAINT "event_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_items" ADD CONSTRAINT "event_items_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "item_analyses" ADD CONSTRAINT "item_analyses_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "item_analyses" ADD CONSTRAINT "item_analyses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stories_sources" ADD CONSTRAINT "stories_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stories_locales" ADD CONSTRAINT "stories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_last_seen_idx" ON "events" USING btree ("last_seen_at");
  CREATE UNIQUE INDEX "event_items_event_item_idx" ON "event_items" USING btree ("event_id","item_id");
  CREATE INDEX "event_items_item_idx" ON "event_items" USING btree ("item_id");
  CREATE UNIQUE INDEX "item_analyses_item_idx" ON "item_analyses" USING btree ("item_id");
  CREATE INDEX "item_analyses_outcome_idx" ON "item_analyses" USING btree ("outcome","updated_at");
  CREATE INDEX "item_analyses_event_idx" ON "item_analyses" USING btree ("event_id");
  CREATE INDEX "stories_sources_order_idx" ON "stories_sources" USING btree ("_order");
  CREATE INDEX "stories_sources_parent_id_idx" ON "stories_sources" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "stories_slug_idx" ON "stories" USING btree ("slug");
  CREATE UNIQUE INDEX "stories_representative_item_id_idx" ON "stories" USING btree ("representative_item_id");
  CREATE INDEX "stories_updated_at_idx" ON "stories" USING btree ("updated_at");
  CREATE INDEX "stories_created_at_idx" ON "stories" USING btree ("created_at");
  CREATE UNIQUE INDEX "stories_locales_locale_parent_id_unique" ON "stories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stories_locales_parent_id_idx" ON "stories_locales" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_stories_id_idx" ON "payload_locked_documents_rels" USING btree ("stories_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered by hand: dropping the collection tables with CASCADE already removes the
  // lock-table constraints, so the generated order (tables first) failed on DROP CONSTRAINT.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stories_fk";
  DROP INDEX "payload_locked_documents_rels_stories_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "stories_id";
  ALTER TABLE "events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "item_analyses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stories_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stories_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "events" CASCADE;
  DROP TABLE "event_items" CASCADE;
  DROP TABLE "item_analyses" CASCADE;
  DROP TABLE "stories_sources" CASCADE;
  DROP TABLE "stories" CASCADE;
  DROP TABLE "stories_locales" CASCADE;
  DROP TYPE "public"."enum_stories_sources_role";
  DROP TYPE "public"."enum_stories_category";
  DROP TYPE "public"."enum_stories_status";`)
}
