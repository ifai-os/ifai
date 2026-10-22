import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_skills_last_import_status" AS ENUM('queued', 'running', 'done', 'failed');
  CREATE TYPE "public"."enum__skills_v_version_status" AS ENUM('draft', 'in_review', 'published', 'delisted');
  CREATE TYPE "public"."enum__skills_v_version_last_import_status" AS ENUM('queued', 'running', 'done', 'failed');
  CREATE TYPE "public"."enum__skills_v_version_category" AS ENUM('coding', 'knowledge', 'writing', 'design', 'data', 'productivity', 'life');
  CREATE TABLE "_skills_v_version_capabilities" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"detail" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_skills_v_version_workflow" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"detail" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_skills_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar NOT NULL,
  	"version_status" "enum__skills_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_delist_reason" varchar,
  	"version_current_version_id" integer,
  	"version_last_import_status" "enum__skills_v_version_last_import_status",
  	"version_last_import_ref" varchar,
  	"version_last_import_commit" varchar,
  	"version_last_import_message" varchar,
  	"version_last_import_at" timestamp(3) with time zone,
  	"version_certified" boolean DEFAULT false,
  	"version_featured" boolean DEFAULT false,
  	"version_category" "enum__skills_v_version_category" NOT NULL,
  	"version_author_name" varchar NOT NULL,
  	"version_author_url" varchar,
  	"version_author_official" boolean DEFAULT false,
  	"version_repository" varchar,
  	"version_license" varchar,
  	"version_license_consent" boolean DEFAULT false,
  	"version_needs_api_key" boolean DEFAULT false,
  	"version_stats_installs" numeric DEFAULT 0,
  	"version_stats_installs7d" numeric DEFAULT 0,
  	"version_stats_saves" numeric DEFAULT 0,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_skills_v_locales" (
  	"version_name" varchar NOT NULL,
  	"version_tagline" varchar,
  	"version_example" varchar,
  	"version_notes" varchar,
  	"version_owner_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_skills_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_skills_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"skill_tags_id" integer
  );
  
  ALTER TABLE "skills" ADD COLUMN "last_import_status" "enum_skills_last_import_status";
  ALTER TABLE "skills" ADD COLUMN "last_import_ref" varchar;
  ALTER TABLE "skills" ADD COLUMN "last_import_commit" varchar;
  ALTER TABLE "skills" ADD COLUMN "last_import_message" varchar;
  ALTER TABLE "skills" ADD COLUMN "last_import_at" timestamp(3) with time zone;
  ALTER TABLE "skills" ADD COLUMN "license_consent" boolean DEFAULT false;
  ALTER TABLE "skill_versions" ADD COLUMN "review_note" varchar;
  ALTER TABLE "_skills_v_version_capabilities" ADD CONSTRAINT "_skills_v_version_capabilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_skills_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_skills_v_version_workflow" ADD CONSTRAINT "_skills_v_version_workflow_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_skills_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_skills_v" ADD CONSTRAINT "_skills_v_parent_id_skills_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_skills_v" ADD CONSTRAINT "_skills_v_version_current_version_id_skill_versions_id_fk" FOREIGN KEY ("version_current_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_skills_v_locales" ADD CONSTRAINT "_skills_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_skills_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_skills_v_texts" ADD CONSTRAINT "_skills_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_skills_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_skills_v_rels" ADD CONSTRAINT "_skills_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_skills_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_skills_v_rels" ADD CONSTRAINT "_skills_v_rels_skill_tags_fk" FOREIGN KEY ("skill_tags_id") REFERENCES "public"."skill_tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_skills_v_version_capabilities_order_idx" ON "_skills_v_version_capabilities" USING btree ("_order");
  CREATE INDEX "_skills_v_version_capabilities_parent_id_idx" ON "_skills_v_version_capabilities" USING btree ("_parent_id");
  CREATE INDEX "_skills_v_version_capabilities_locale_idx" ON "_skills_v_version_capabilities" USING btree ("_locale");
  CREATE INDEX "_skills_v_version_workflow_order_idx" ON "_skills_v_version_workflow" USING btree ("_order");
  CREATE INDEX "_skills_v_version_workflow_parent_id_idx" ON "_skills_v_version_workflow" USING btree ("_parent_id");
  CREATE INDEX "_skills_v_version_workflow_locale_idx" ON "_skills_v_version_workflow" USING btree ("_locale");
  CREATE INDEX "_skills_v_parent_idx" ON "_skills_v" USING btree ("parent_id");
  CREATE INDEX "_skills_v_version_version_slug_idx" ON "_skills_v" USING btree ("version_slug");
  CREATE INDEX "_skills_v_version_version_status_idx" ON "_skills_v" USING btree ("version_status");
  CREATE INDEX "_skills_v_version_version_current_version_idx" ON "_skills_v" USING btree ("version_current_version_id");
  CREATE INDEX "_skills_v_version_version_certified_idx" ON "_skills_v" USING btree ("version_certified");
  CREATE INDEX "_skills_v_version_version_category_idx" ON "_skills_v" USING btree ("version_category");
  CREATE INDEX "_skills_v_version_version_needs_api_key_idx" ON "_skills_v" USING btree ("version_needs_api_key");
  CREATE INDEX "_skills_v_version_version_updated_at_idx" ON "_skills_v" USING btree ("version_updated_at");
  CREATE INDEX "_skills_v_version_version_created_at_idx" ON "_skills_v" USING btree ("version_created_at");
  CREATE INDEX "_skills_v_created_at_idx" ON "_skills_v" USING btree ("created_at");
  CREATE INDEX "_skills_v_updated_at_idx" ON "_skills_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_skills_v_locales_locale_parent_id_unique" ON "_skills_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_skills_v_locales_parent_id_idx" ON "_skills_v_locales" USING btree ("_parent_id");
  CREATE INDEX "_skills_v_texts_order_parent" ON "_skills_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_skills_v_rels_order_idx" ON "_skills_v_rels" USING btree ("order");
  CREATE INDEX "_skills_v_rels_parent_idx" ON "_skills_v_rels" USING btree ("parent_id");
  CREATE INDEX "_skills_v_rels_path_idx" ON "_skills_v_rels" USING btree ("path");
  CREATE INDEX "_skills_v_rels_skill_tags_id_idx" ON "_skills_v_rels" USING btree ("skill_tags_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "_skills_v_version_capabilities" CASCADE;
  DROP TABLE "_skills_v_version_workflow" CASCADE;
  DROP TABLE "_skills_v" CASCADE;
  DROP TABLE "_skills_v_locales" CASCADE;
  DROP TABLE "_skills_v_texts" CASCADE;
  DROP TABLE "_skills_v_rels" CASCADE;
  ALTER TABLE "skills" DROP COLUMN "last_import_status";
  ALTER TABLE "skills" DROP COLUMN "last_import_ref";
  ALTER TABLE "skills" DROP COLUMN "last_import_commit";
  ALTER TABLE "skills" DROP COLUMN "last_import_message";
  ALTER TABLE "skills" DROP COLUMN "last_import_at";
  ALTER TABLE "skills" DROP COLUMN "license_consent";
  ALTER TABLE "skill_versions" DROP COLUMN "review_note";
  DROP TYPE "public"."enum_skills_last_import_status";
  DROP TYPE "public"."enum__skills_v_version_status";
  DROP TYPE "public"."enum__skills_v_version_last_import_status";
  DROP TYPE "public"."enum__skills_v_version_category";`)
}
