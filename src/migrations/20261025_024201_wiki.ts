import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // This migration first ran as 20261024_183256_wiki, then was made again after the daily migrations of #60, with the
  // same SQL. A database that ran it under that name (PR #65's preview) already has these tables: take over its record
  // instead of creating them again. Nowhere else has that record.
  const renamed = await db.execute(sql`DELETE FROM "payload_migrations" WHERE "name" = '20261024_183256_wiki'`)
  if (renamed.rowCount) return

  await db.execute(sql`
   CREATE TYPE "public"."enum_wiki_entries_type" AS ENUM('concept', 'method');
  CREATE TYPE "public"."enum_wiki_entries_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__wiki_entries_v_version_type" AS ENUM('concept', 'method');
  CREATE TYPE "public"."enum__wiki_entries_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "wiki_topics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "wiki_topics_locales" (
  	"name" varchar NOT NULL,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "wiki_topics_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"wiki_entries_id" integer
  );
  
  CREATE TABLE "wiki_entries_examples" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "wiki_entries_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"detail" varchar
  );
  
  CREATE TABLE "wiki_entries_contexts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"meaning" varchar NOT NULL
  );
  
  CREATE TABLE "wiki_entries_comparisons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"entry_id" integer,
  	"difference" varchar NOT NULL
  );
  
  CREATE TABLE "wiki_entries_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"publisher" varchar
  );
  
  CREATE TABLE "wiki_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"type" "enum_wiki_entries_type" DEFAULT 'concept' NOT NULL,
  	"status" "enum_wiki_entries_status" DEFAULT 'draft' NOT NULL,
  	"reviewed_at" timestamp(3) with time zone,
  	"featured" boolean DEFAULT false,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "wiki_entries_locales" (
  	"title" varchar NOT NULL,
  	"definition" varchar,
  	"explanation" varchar,
  	"uses" varchar,
  	"limitations" varchar,
  	"fact" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "wiki_entries_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar,
  	"locale" "_locales"
  );
  
  CREATE TABLE "wiki_entries_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"wiki_topics_id" integer,
  	"wiki_entries_id" integer,
  	"apps_id" integer,
  	"skills_id" integer,
  	"stories_id" integer
  );
  
  CREATE TABLE "_wiki_entries_v_version_examples" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_wiki_entries_v_version_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"detail" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_wiki_entries_v_version_contexts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"meaning" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_wiki_entries_v_version_comparisons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"entry_id" integer,
  	"difference" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_wiki_entries_v_version_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"publisher" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_wiki_entries_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar NOT NULL,
  	"version_type" "enum__wiki_entries_v_version_type" DEFAULT 'concept' NOT NULL,
  	"version_status" "enum__wiki_entries_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_reviewed_at" timestamp(3) with time zone,
  	"version_featured" boolean DEFAULT false,
  	"version_published_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_wiki_entries_v_locales" (
  	"version_title" varchar NOT NULL,
  	"version_definition" varchar,
  	"version_explanation" varchar,
  	"version_uses" varchar,
  	"version_limitations" varchar,
  	"version_fact" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_wiki_entries_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar,
  	"locale" "_locales"
  );
  
  CREATE TABLE "_wiki_entries_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"wiki_topics_id" integer,
  	"wiki_entries_id" integer,
  	"apps_id" integer,
  	"skills_id" integer,
  	"stories_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "wiki_topics_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "wiki_entries_id" integer;
  ALTER TABLE "wiki_topics_locales" ADD CONSTRAINT "wiki_topics_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wiki_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_topics_rels" ADD CONSTRAINT "wiki_topics_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wiki_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_topics_rels" ADD CONSTRAINT "wiki_topics_rels_wiki_entries_fk" FOREIGN KEY ("wiki_entries_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_examples" ADD CONSTRAINT "wiki_entries_examples_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_steps" ADD CONSTRAINT "wiki_entries_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_contexts" ADD CONSTRAINT "wiki_entries_contexts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_comparisons" ADD CONSTRAINT "wiki_entries_comparisons_entry_id_wiki_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."wiki_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wiki_entries_comparisons" ADD CONSTRAINT "wiki_entries_comparisons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_sources" ADD CONSTRAINT "wiki_entries_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_locales" ADD CONSTRAINT "wiki_entries_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_texts" ADD CONSTRAINT "wiki_entries_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_rels" ADD CONSTRAINT "wiki_entries_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_rels" ADD CONSTRAINT "wiki_entries_rels_wiki_topics_fk" FOREIGN KEY ("wiki_topics_id") REFERENCES "public"."wiki_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_rels" ADD CONSTRAINT "wiki_entries_rels_wiki_entries_fk" FOREIGN KEY ("wiki_entries_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_rels" ADD CONSTRAINT "wiki_entries_rels_apps_fk" FOREIGN KEY ("apps_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_rels" ADD CONSTRAINT "wiki_entries_rels_skills_fk" FOREIGN KEY ("skills_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wiki_entries_rels" ADD CONSTRAINT "wiki_entries_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_version_examples" ADD CONSTRAINT "_wiki_entries_v_version_examples_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_version_steps" ADD CONSTRAINT "_wiki_entries_v_version_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_version_contexts" ADD CONSTRAINT "_wiki_entries_v_version_contexts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_version_comparisons" ADD CONSTRAINT "_wiki_entries_v_version_comparisons_entry_id_wiki_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."wiki_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_version_comparisons" ADD CONSTRAINT "_wiki_entries_v_version_comparisons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_version_sources" ADD CONSTRAINT "_wiki_entries_v_version_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v" ADD CONSTRAINT "_wiki_entries_v_parent_id_wiki_entries_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wiki_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_locales" ADD CONSTRAINT "_wiki_entries_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_texts" ADD CONSTRAINT "_wiki_entries_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_rels" ADD CONSTRAINT "_wiki_entries_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_wiki_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_rels" ADD CONSTRAINT "_wiki_entries_v_rels_wiki_topics_fk" FOREIGN KEY ("wiki_topics_id") REFERENCES "public"."wiki_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_rels" ADD CONSTRAINT "_wiki_entries_v_rels_wiki_entries_fk" FOREIGN KEY ("wiki_entries_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_rels" ADD CONSTRAINT "_wiki_entries_v_rels_apps_fk" FOREIGN KEY ("apps_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_rels" ADD CONSTRAINT "_wiki_entries_v_rels_skills_fk" FOREIGN KEY ("skills_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wiki_entries_v_rels" ADD CONSTRAINT "_wiki_entries_v_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "wiki_topics_slug_idx" ON "wiki_topics" USING btree ("slug");
  CREATE INDEX "wiki_topics_updated_at_idx" ON "wiki_topics" USING btree ("updated_at");
  CREATE INDEX "wiki_topics_created_at_idx" ON "wiki_topics" USING btree ("created_at");
  CREATE UNIQUE INDEX "wiki_topics_locales_locale_parent_id_unique" ON "wiki_topics_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wiki_topics_locales_parent_id_idx" ON "wiki_topics_locales" USING btree ("_parent_id");
  CREATE INDEX "wiki_topics_rels_order_idx" ON "wiki_topics_rels" USING btree ("order");
  CREATE INDEX "wiki_topics_rels_parent_idx" ON "wiki_topics_rels" USING btree ("parent_id");
  CREATE INDEX "wiki_topics_rels_path_idx" ON "wiki_topics_rels" USING btree ("path");
  CREATE INDEX "wiki_topics_rels_wiki_entries_id_idx" ON "wiki_topics_rels" USING btree ("wiki_entries_id");
  CREATE INDEX "wiki_entries_examples_order_idx" ON "wiki_entries_examples" USING btree ("_order");
  CREATE INDEX "wiki_entries_examples_parent_id_idx" ON "wiki_entries_examples" USING btree ("_parent_id");
  CREATE INDEX "wiki_entries_examples_locale_idx" ON "wiki_entries_examples" USING btree ("_locale");
  CREATE INDEX "wiki_entries_steps_order_idx" ON "wiki_entries_steps" USING btree ("_order");
  CREATE INDEX "wiki_entries_steps_parent_id_idx" ON "wiki_entries_steps" USING btree ("_parent_id");
  CREATE INDEX "wiki_entries_steps_locale_idx" ON "wiki_entries_steps" USING btree ("_locale");
  CREATE INDEX "wiki_entries_contexts_order_idx" ON "wiki_entries_contexts" USING btree ("_order");
  CREATE INDEX "wiki_entries_contexts_parent_id_idx" ON "wiki_entries_contexts" USING btree ("_parent_id");
  CREATE INDEX "wiki_entries_contexts_locale_idx" ON "wiki_entries_contexts" USING btree ("_locale");
  CREATE INDEX "wiki_entries_comparisons_order_idx" ON "wiki_entries_comparisons" USING btree ("_order");
  CREATE INDEX "wiki_entries_comparisons_parent_id_idx" ON "wiki_entries_comparisons" USING btree ("_parent_id");
  CREATE INDEX "wiki_entries_comparisons_locale_idx" ON "wiki_entries_comparisons" USING btree ("_locale");
  CREATE INDEX "wiki_entries_comparisons_entry_idx" ON "wiki_entries_comparisons" USING btree ("entry_id");
  CREATE INDEX "wiki_entries_sources_order_idx" ON "wiki_entries_sources" USING btree ("_order");
  CREATE INDEX "wiki_entries_sources_parent_id_idx" ON "wiki_entries_sources" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "wiki_entries_slug_idx" ON "wiki_entries" USING btree ("slug");
  CREATE INDEX "wiki_entries_status_idx" ON "wiki_entries" USING btree ("status");
  CREATE INDEX "wiki_entries_updated_at_idx" ON "wiki_entries" USING btree ("updated_at");
  CREATE INDEX "wiki_entries_created_at_idx" ON "wiki_entries" USING btree ("created_at");
  CREATE UNIQUE INDEX "wiki_entries_locales_locale_parent_id_unique" ON "wiki_entries_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wiki_entries_locales_parent_id_idx" ON "wiki_entries_locales" USING btree ("_parent_id");
  CREATE INDEX "wiki_entries_texts_order_parent" ON "wiki_entries_texts" USING btree ("order","parent_id");
  CREATE INDEX "wiki_entries_texts_locale_parent" ON "wiki_entries_texts" USING btree ("locale","parent_id");
  CREATE INDEX "wiki_entries_rels_order_idx" ON "wiki_entries_rels" USING btree ("order");
  CREATE INDEX "wiki_entries_rels_parent_idx" ON "wiki_entries_rels" USING btree ("parent_id");
  CREATE INDEX "wiki_entries_rels_path_idx" ON "wiki_entries_rels" USING btree ("path");
  CREATE INDEX "wiki_entries_rels_wiki_topics_id_idx" ON "wiki_entries_rels" USING btree ("wiki_topics_id");
  CREATE INDEX "wiki_entries_rels_wiki_entries_id_idx" ON "wiki_entries_rels" USING btree ("wiki_entries_id");
  CREATE INDEX "wiki_entries_rels_apps_id_idx" ON "wiki_entries_rels" USING btree ("apps_id");
  CREATE INDEX "wiki_entries_rels_skills_id_idx" ON "wiki_entries_rels" USING btree ("skills_id");
  CREATE INDEX "wiki_entries_rels_stories_id_idx" ON "wiki_entries_rels" USING btree ("stories_id");
  CREATE INDEX "_wiki_entries_v_version_examples_order_idx" ON "_wiki_entries_v_version_examples" USING btree ("_order");
  CREATE INDEX "_wiki_entries_v_version_examples_parent_id_idx" ON "_wiki_entries_v_version_examples" USING btree ("_parent_id");
  CREATE INDEX "_wiki_entries_v_version_examples_locale_idx" ON "_wiki_entries_v_version_examples" USING btree ("_locale");
  CREATE INDEX "_wiki_entries_v_version_steps_order_idx" ON "_wiki_entries_v_version_steps" USING btree ("_order");
  CREATE INDEX "_wiki_entries_v_version_steps_parent_id_idx" ON "_wiki_entries_v_version_steps" USING btree ("_parent_id");
  CREATE INDEX "_wiki_entries_v_version_steps_locale_idx" ON "_wiki_entries_v_version_steps" USING btree ("_locale");
  CREATE INDEX "_wiki_entries_v_version_contexts_order_idx" ON "_wiki_entries_v_version_contexts" USING btree ("_order");
  CREATE INDEX "_wiki_entries_v_version_contexts_parent_id_idx" ON "_wiki_entries_v_version_contexts" USING btree ("_parent_id");
  CREATE INDEX "_wiki_entries_v_version_contexts_locale_idx" ON "_wiki_entries_v_version_contexts" USING btree ("_locale");
  CREATE INDEX "_wiki_entries_v_version_comparisons_order_idx" ON "_wiki_entries_v_version_comparisons" USING btree ("_order");
  CREATE INDEX "_wiki_entries_v_version_comparisons_parent_id_idx" ON "_wiki_entries_v_version_comparisons" USING btree ("_parent_id");
  CREATE INDEX "_wiki_entries_v_version_comparisons_locale_idx" ON "_wiki_entries_v_version_comparisons" USING btree ("_locale");
  CREATE INDEX "_wiki_entries_v_version_comparisons_entry_idx" ON "_wiki_entries_v_version_comparisons" USING btree ("entry_id");
  CREATE INDEX "_wiki_entries_v_version_sources_order_idx" ON "_wiki_entries_v_version_sources" USING btree ("_order");
  CREATE INDEX "_wiki_entries_v_version_sources_parent_id_idx" ON "_wiki_entries_v_version_sources" USING btree ("_parent_id");
  CREATE INDEX "_wiki_entries_v_parent_idx" ON "_wiki_entries_v" USING btree ("parent_id");
  CREATE INDEX "_wiki_entries_v_version_version_slug_idx" ON "_wiki_entries_v" USING btree ("version_slug");
  CREATE INDEX "_wiki_entries_v_version_version_status_idx" ON "_wiki_entries_v" USING btree ("version_status");
  CREATE INDEX "_wiki_entries_v_version_version_updated_at_idx" ON "_wiki_entries_v" USING btree ("version_updated_at");
  CREATE INDEX "_wiki_entries_v_version_version_created_at_idx" ON "_wiki_entries_v" USING btree ("version_created_at");
  CREATE INDEX "_wiki_entries_v_created_at_idx" ON "_wiki_entries_v" USING btree ("created_at");
  CREATE INDEX "_wiki_entries_v_updated_at_idx" ON "_wiki_entries_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_wiki_entries_v_locales_locale_parent_id_unique" ON "_wiki_entries_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_wiki_entries_v_locales_parent_id_idx" ON "_wiki_entries_v_locales" USING btree ("_parent_id");
  CREATE INDEX "_wiki_entries_v_texts_order_parent" ON "_wiki_entries_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_wiki_entries_v_texts_locale_parent" ON "_wiki_entries_v_texts" USING btree ("locale","parent_id");
  CREATE INDEX "_wiki_entries_v_rels_order_idx" ON "_wiki_entries_v_rels" USING btree ("order");
  CREATE INDEX "_wiki_entries_v_rels_parent_idx" ON "_wiki_entries_v_rels" USING btree ("parent_id");
  CREATE INDEX "_wiki_entries_v_rels_path_idx" ON "_wiki_entries_v_rels" USING btree ("path");
  CREATE INDEX "_wiki_entries_v_rels_wiki_topics_id_idx" ON "_wiki_entries_v_rels" USING btree ("wiki_topics_id");
  CREATE INDEX "_wiki_entries_v_rels_wiki_entries_id_idx" ON "_wiki_entries_v_rels" USING btree ("wiki_entries_id");
  CREATE INDEX "_wiki_entries_v_rels_apps_id_idx" ON "_wiki_entries_v_rels" USING btree ("apps_id");
  CREATE INDEX "_wiki_entries_v_rels_skills_id_idx" ON "_wiki_entries_v_rels" USING btree ("skills_id");
  CREATE INDEX "_wiki_entries_v_rels_stories_id_idx" ON "_wiki_entries_v_rels" USING btree ("stories_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wiki_topics_fk" FOREIGN KEY ("wiki_topics_id") REFERENCES "public"."wiki_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wiki_entries_fk" FOREIGN KEY ("wiki_entries_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_wiki_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("wiki_topics_id");
  CREATE INDEX "payload_locked_documents_rels_wiki_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("wiki_entries_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wiki_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_topics_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_topics_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_examples" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_contexts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_comparisons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "wiki_entries_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_version_examples" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_version_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_version_contexts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_version_comparisons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_version_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_wiki_entries_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "wiki_topics" CASCADE;
  DROP TABLE "wiki_topics_locales" CASCADE;
  DROP TABLE "wiki_topics_rels" CASCADE;
  DROP TABLE "wiki_entries_examples" CASCADE;
  DROP TABLE "wiki_entries_steps" CASCADE;
  DROP TABLE "wiki_entries_contexts" CASCADE;
  DROP TABLE "wiki_entries_comparisons" CASCADE;
  DROP TABLE "wiki_entries_sources" CASCADE;
  DROP TABLE "wiki_entries" CASCADE;
  DROP TABLE "wiki_entries_locales" CASCADE;
  DROP TABLE "wiki_entries_texts" CASCADE;
  DROP TABLE "wiki_entries_rels" CASCADE;
  DROP TABLE "_wiki_entries_v_version_examples" CASCADE;
  DROP TABLE "_wiki_entries_v_version_steps" CASCADE;
  DROP TABLE "_wiki_entries_v_version_contexts" CASCADE;
  DROP TABLE "_wiki_entries_v_version_comparisons" CASCADE;
  DROP TABLE "_wiki_entries_v_version_sources" CASCADE;
  DROP TABLE "_wiki_entries_v" CASCADE;
  DROP TABLE "_wiki_entries_v_locales" CASCADE;
  DROP TABLE "_wiki_entries_v_texts" CASCADE;
  DROP TABLE "_wiki_entries_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_wiki_topics_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_wiki_entries_fk";
  
  DROP INDEX "payload_locked_documents_rels_wiki_topics_id_idx";
  DROP INDEX "payload_locked_documents_rels_wiki_entries_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "wiki_topics_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "wiki_entries_id";
  DROP TYPE "public"."enum_wiki_entries_type";
  DROP TYPE "public"."enum_wiki_entries_status";
  DROP TYPE "public"."enum__wiki_entries_v_version_type";
  DROP TYPE "public"."enum__wiki_entries_v_version_status";`)
}
