import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_storylines_status" AS ENUM('active', 'ended', 'merged');
  CREATE TABLE "storylines" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"status" "enum_storylines_status" DEFAULT 'active' NOT NULL,
  	"merged_into_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "storylines_locales" (
  	"name" varchar NOT NULL,
  	"summary" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "stories" ADD COLUMN "storyline_id" integer;
  ALTER TABLE "stories" ADD COLUMN "storyline_by_editor" boolean;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "storylines_id" integer;
  ALTER TABLE "storylines" ADD CONSTRAINT "storylines_merged_into_id_storylines_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."storylines"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "storylines_locales" ADD CONSTRAINT "storylines_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."storylines"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "storylines_slug_idx" ON "storylines" USING btree ("slug");
  CREATE INDEX "storylines_merged_into_idx" ON "storylines" USING btree ("merged_into_id");
  CREATE INDEX "storylines_updated_at_idx" ON "storylines" USING btree ("updated_at");
  CREATE INDEX "storylines_created_at_idx" ON "storylines" USING btree ("created_at");
  CREATE UNIQUE INDEX "storylines_locales_locale_parent_id_unique" ON "storylines_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "storylines_locales_parent_id_idx" ON "storylines_locales" USING btree ("_parent_id");
  ALTER TABLE "stories" ADD CONSTRAINT "stories_storyline_id_storylines_id_fk" FOREIGN KEY ("storyline_id") REFERENCES "public"."storylines"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_storylines_fk" FOREIGN KEY ("storylines_id") REFERENCES "public"."storylines"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "stories_storyline_idx" ON "stories" USING btree ("storyline_id");
  CREATE INDEX "payload_locked_documents_rels_storylines_id_idx" ON "payload_locked_documents_rels" USING btree ("storylines_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "storylines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "storylines_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "storylines" CASCADE;
  DROP TABLE "storylines_locales" CASCADE;
  ALTER TABLE "stories" DROP CONSTRAINT "stories_storyline_id_storylines_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_storylines_fk";
  
  DROP INDEX "stories_storyline_idx";
  DROP INDEX "payload_locked_documents_rels_storylines_id_idx";
  ALTER TABLE "stories" DROP COLUMN "storyline_id";
  ALTER TABLE "stories" DROP COLUMN "storyline_by_editor";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "storylines_id";
  DROP TYPE "public"."enum_storylines_status";`)
}
