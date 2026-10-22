import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The six agent hosts of docs/specs/resources.md (rule 11), in display order. Directories and
 * websites are filled in only where known; the owner completes the rest, the install notes and
 * the official logos in the back office. Kept inline so this migration stays frozen.
 */
const hosts = [
  {
    slug: 'claude-code',
    name: 'Claude Code',
    website: 'https://claude.com/claude-code',
    globalDir: '~/.claude/skills/',
    projectDir: '.claude/skills/',
  },
  { slug: 'codex', name: 'Codex', website: 'https://openai.com/codex', globalDir: null, projectDir: null },
  { slug: 'openclaw', name: 'OpenClaw', website: null, globalDir: null, projectDir: null },
  { slug: 'hermes', name: 'Hermes', website: null, globalDir: null, projectDir: null },
  { slug: 'pi', name: 'Pi', website: null, globalDir: null, projectDir: null },
  { slug: 'workbuddy', name: 'WorkBuddy', website: null, globalDir: null, projectDir: null },
]

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_skills_status" AS ENUM('draft', 'in_review', 'published', 'delisted');
  CREATE TYPE "public"."enum_skills_category" AS ENUM('coding', 'knowledge', 'writing', 'design', 'data', 'productivity', 'life');
  CREATE TYPE "public"."enum_skill_versions_checks_result" AS ENUM('pass', 'warn', 'block');
  CREATE TYPE "public"."enum_skill_versions_findings_severity" AS ENUM('high', 'medium');
  CREATE TYPE "public"."enum_skill_versions_compatibility_status" AS ENUM('verified', 'claimed', 'untested', 'failed', 'needs_recheck');
  CREATE TYPE "public"."enum_skill_versions_status" AS ENUM('scanning', 'in_review', 'published', 'deprecated', 'withdrawn');
  CREATE TYPE "public"."enum_skill_versions_scan_status" AS ENUM('pending', 'passed', 'warnings', 'blocked');
  CREATE TYPE "public"."enum_skill_submissions_status" AS ENUM('pending', 'accepted', 'rejected');
  CREATE TABLE "skill_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"skill_id" integer NOT NULL,
  	"version_id" integer,
  	"type" text NOT NULL,
  	"host_slug" text,
  	"visitor_hash" text NOT NULL,
  	"day" date NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "skills_capabilities" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"detail" varchar
  );
  
  CREATE TABLE "skills_workflow" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"detail" varchar
  );
  
  CREATE TABLE "skills" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"status" "enum_skills_status" DEFAULT 'draft' NOT NULL,
  	"delist_reason" varchar,
  	"current_version_id" integer,
  	"certified" boolean DEFAULT false,
  	"featured" boolean DEFAULT false,
  	"category" "enum_skills_category" NOT NULL,
  	"author_name" varchar NOT NULL,
  	"author_url" varchar,
  	"author_official" boolean DEFAULT false,
  	"repository" varchar,
  	"license" varchar,
  	"needs_api_key" boolean DEFAULT false,
  	"stats_installs" numeric DEFAULT 0,
  	"stats_installs7d" numeric DEFAULT 0,
  	"stats_saves" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "skills_locales" (
  	"name" varchar NOT NULL,
  	"tagline" varchar,
  	"example" varchar,
  	"notes" varchar,
  	"owner_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "skills_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "skills_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"skill_tags_id" integer
  );
  
  CREATE TABLE "skill_versions_files" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar NOT NULL,
  	"size" numeric,
  	"sha256" varchar
  );
  
  CREATE TABLE "skill_versions_checks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"result" "enum_skill_versions_checks_result" NOT NULL,
  	"note" varchar
  );
  
  CREATE TABLE "skill_versions_findings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"severity" "enum_skill_versions_findings_severity" NOT NULL,
  	"file" varchar,
  	"line" numeric,
  	"message" varchar NOT NULL
  );
  
  CREATE TABLE "skill_versions_compatibility" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"host_id" integer NOT NULL,
  	"status" "enum_skill_versions_compatibility_status" DEFAULT 'untested' NOT NULL,
  	"checked_at" timestamp(3) with time zone,
  	"note" varchar
  );
  
  CREATE TABLE "skill_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"skill_id" integer NOT NULL,
  	"version" varchar NOT NULL,
  	"status" "enum_skill_versions_status" DEFAULT 'in_review' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"withdraw_reason" varchar,
  	"source_commit" varchar,
  	"sha256" varchar,
  	"skill_md" varchar,
  	"frontmatter" jsonb,
  	"declarations_file_scope" varchar,
  	"scan_status" "enum_skill_versions_scan_status" DEFAULT 'pending' NOT NULL,
  	"scanned_at" timestamp(3) with time zone,
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
  	"focal_y" numeric
  );
  
  CREATE TABLE "skill_versions_locales" (
  	"changelog" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "skill_versions_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "agent_hosts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"order" numeric DEFAULT 0,
  	"website" varchar,
  	"logo_id" integer,
  	"global_dir" varchar,
  	"project_dir" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "agent_hosts_locales" (
  	"instructions" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "skill_tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "skill_tags_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "skill_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar,
  	"status" "enum_skill_submissions_status" DEFAULT 'pending' NOT NULL,
  	"skill_id" integer,
  	"repository" varchar NOT NULL,
  	"note" varchar,
  	"email" varchar NOT NULL,
  	"submitter_id" varchar,
  	"admin_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "skills_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "skill_versions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "agent_hosts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "skill_tags_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "skill_submissions_id" integer;
  ALTER TABLE "skills_capabilities" ADD CONSTRAINT "skills_capabilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skills_workflow" ADD CONSTRAINT "skills_workflow_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skills" ADD CONSTRAINT "skills_current_version_id_skill_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "skills_locales" ADD CONSTRAINT "skills_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skills_texts" ADD CONSTRAINT "skills_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skills_rels" ADD CONSTRAINT "skills_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skills_rels" ADD CONSTRAINT "skills_rels_skill_tags_fk" FOREIGN KEY ("skill_tags_id") REFERENCES "public"."skill_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_versions_files" ADD CONSTRAINT "skill_versions_files_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_versions_checks" ADD CONSTRAINT "skill_versions_checks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_versions_findings" ADD CONSTRAINT "skill_versions_findings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_versions_compatibility" ADD CONSTRAINT "skill_versions_compatibility_host_id_agent_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."agent_hosts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "skill_versions_compatibility" ADD CONSTRAINT "skill_versions_compatibility_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "skill_versions_locales" ADD CONSTRAINT "skill_versions_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_versions_texts" ADD CONSTRAINT "skill_versions_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_hosts" ADD CONSTRAINT "agent_hosts_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_hosts_locales" ADD CONSTRAINT "agent_hosts_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."agent_hosts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_tags_locales" ADD CONSTRAINT "skill_tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."skill_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "skill_submissions" ADD CONSTRAINT "skill_submissions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "skill_events_skill_visitor_day_idx" ON "skill_events" USING btree ("skill_id","visitor_hash","day");
  CREATE INDEX "skill_events_skill_day_idx" ON "skill_events" USING btree ("skill_id","day");
  CREATE INDEX "skills_capabilities_order_idx" ON "skills_capabilities" USING btree ("_order");
  CREATE INDEX "skills_capabilities_parent_id_idx" ON "skills_capabilities" USING btree ("_parent_id");
  CREATE INDEX "skills_capabilities_locale_idx" ON "skills_capabilities" USING btree ("_locale");
  CREATE INDEX "skills_workflow_order_idx" ON "skills_workflow" USING btree ("_order");
  CREATE INDEX "skills_workflow_parent_id_idx" ON "skills_workflow" USING btree ("_parent_id");
  CREATE INDEX "skills_workflow_locale_idx" ON "skills_workflow" USING btree ("_locale");
  CREATE UNIQUE INDEX "skills_slug_idx" ON "skills" USING btree ("slug");
  CREATE INDEX "skills_status_idx" ON "skills" USING btree ("status");
  CREATE INDEX "skills_current_version_idx" ON "skills" USING btree ("current_version_id");
  CREATE INDEX "skills_certified_idx" ON "skills" USING btree ("certified");
  CREATE INDEX "skills_category_idx" ON "skills" USING btree ("category");
  CREATE INDEX "skills_needs_api_key_idx" ON "skills" USING btree ("needs_api_key");
  CREATE INDEX "skills_updated_at_idx" ON "skills" USING btree ("updated_at");
  CREATE INDEX "skills_created_at_idx" ON "skills" USING btree ("created_at");
  CREATE UNIQUE INDEX "skills_locales_locale_parent_id_unique" ON "skills_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "skills_locales_parent_id_idx" ON "skills_locales" USING btree ("_parent_id");
  CREATE INDEX "skills_texts_order_parent" ON "skills_texts" USING btree ("order","parent_id");
  CREATE INDEX "skills_rels_order_idx" ON "skills_rels" USING btree ("order");
  CREATE INDEX "skills_rels_parent_idx" ON "skills_rels" USING btree ("parent_id");
  CREATE INDEX "skills_rels_path_idx" ON "skills_rels" USING btree ("path");
  CREATE INDEX "skills_rels_skill_tags_id_idx" ON "skills_rels" USING btree ("skill_tags_id");
  CREATE INDEX "skill_versions_files_order_idx" ON "skill_versions_files" USING btree ("_order");
  CREATE INDEX "skill_versions_files_parent_id_idx" ON "skill_versions_files" USING btree ("_parent_id");
  CREATE INDEX "skill_versions_checks_order_idx" ON "skill_versions_checks" USING btree ("_order");
  CREATE INDEX "skill_versions_checks_parent_id_idx" ON "skill_versions_checks" USING btree ("_parent_id");
  CREATE INDEX "skill_versions_findings_order_idx" ON "skill_versions_findings" USING btree ("_order");
  CREATE INDEX "skill_versions_findings_parent_id_idx" ON "skill_versions_findings" USING btree ("_parent_id");
  CREATE INDEX "skill_versions_compatibility_order_idx" ON "skill_versions_compatibility" USING btree ("_order");
  CREATE INDEX "skill_versions_compatibility_parent_id_idx" ON "skill_versions_compatibility" USING btree ("_parent_id");
  CREATE INDEX "skill_versions_compatibility_host_idx" ON "skill_versions_compatibility" USING btree ("host_id");
  CREATE INDEX "skill_versions_skill_idx" ON "skill_versions" USING btree ("skill_id");
  CREATE INDEX "skill_versions_version_idx" ON "skill_versions" USING btree ("version");
  CREATE INDEX "skill_versions_status_idx" ON "skill_versions" USING btree ("status");
  CREATE INDEX "skill_versions_sha256_idx" ON "skill_versions" USING btree ("sha256");
  CREATE INDEX "skill_versions_scan_status_idx" ON "skill_versions" USING btree ("scan_status");
  CREATE INDEX "skill_versions_updated_at_idx" ON "skill_versions" USING btree ("updated_at");
  CREATE INDEX "skill_versions_created_at_idx" ON "skill_versions" USING btree ("created_at");
  CREATE UNIQUE INDEX "skill_versions_filename_idx" ON "skill_versions" USING btree ("filename");
  CREATE UNIQUE INDEX "skill_versions_locales_locale_parent_id_unique" ON "skill_versions_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "skill_versions_locales_parent_id_idx" ON "skill_versions_locales" USING btree ("_parent_id");
  CREATE INDEX "skill_versions_texts_order_parent" ON "skill_versions_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "agent_hosts_slug_idx" ON "agent_hosts" USING btree ("slug");
  CREATE INDEX "agent_hosts_logo_idx" ON "agent_hosts" USING btree ("logo_id");
  CREATE INDEX "agent_hosts_updated_at_idx" ON "agent_hosts" USING btree ("updated_at");
  CREATE INDEX "agent_hosts_created_at_idx" ON "agent_hosts" USING btree ("created_at");
  CREATE UNIQUE INDEX "agent_hosts_locales_locale_parent_id_unique" ON "agent_hosts_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "agent_hosts_locales_parent_id_idx" ON "agent_hosts_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "skill_tags_slug_idx" ON "skill_tags" USING btree ("slug");
  CREATE INDEX "skill_tags_updated_at_idx" ON "skill_tags" USING btree ("updated_at");
  CREATE INDEX "skill_tags_created_at_idx" ON "skill_tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "skill_tags_locales_locale_parent_id_unique" ON "skill_tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "skill_tags_locales_parent_id_idx" ON "skill_tags_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "skill_submissions_code_idx" ON "skill_submissions" USING btree ("code");
  CREATE INDEX "skill_submissions_status_idx" ON "skill_submissions" USING btree ("status");
  CREATE INDEX "skill_submissions_skill_idx" ON "skill_submissions" USING btree ("skill_id");
  CREATE INDEX "skill_submissions_updated_at_idx" ON "skill_submissions" USING btree ("updated_at");
  CREATE INDEX "skill_submissions_created_at_idx" ON "skill_submissions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_skills_fk" FOREIGN KEY ("skills_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_skill_versions_fk" FOREIGN KEY ("skill_versions_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_hosts_fk" FOREIGN KEY ("agent_hosts_id") REFERENCES "public"."agent_hosts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_skill_tags_fk" FOREIGN KEY ("skill_tags_id") REFERENCES "public"."skill_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_skill_submissions_fk" FOREIGN KEY ("skill_submissions_id") REFERENCES "public"."skill_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_skills_id_idx" ON "payload_locked_documents_rels" USING btree ("skills_id");
  CREATE INDEX "payload_locked_documents_rels_skill_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("skill_versions_id");
  CREATE INDEX "payload_locked_documents_rels_agent_hosts_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_hosts_id");
  CREATE INDEX "payload_locked_documents_rels_skill_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("skill_tags_id");
  CREATE INDEX "payload_locked_documents_rels_skill_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("skill_submissions_id");`)

  for (const [index, host] of hosts.entries()) {
    await db.execute(sql`
      INSERT INTO "agent_hosts" ("name", "slug", "enabled", "order", "website", "global_dir", "project_dir")
      VALUES (${host.name}, ${host.slug}, true, ${index + 1}, ${host.website}, ${host.globalDir}, ${host.projectDir})
    `)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "skill_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skills_capabilities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skills_workflow" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skills" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skills_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skills_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skills_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_versions_files" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_versions_checks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_versions_findings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_versions_compatibility" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_versions_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_versions_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "agent_hosts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "agent_hosts_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_tags_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skill_submissions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "skill_events" CASCADE;
  DROP TABLE "skills_capabilities" CASCADE;
  DROP TABLE "skills_workflow" CASCADE;
  DROP TABLE "skills" CASCADE;
  DROP TABLE "skills_locales" CASCADE;
  DROP TABLE "skills_texts" CASCADE;
  DROP TABLE "skills_rels" CASCADE;
  DROP TABLE "skill_versions_files" CASCADE;
  DROP TABLE "skill_versions_checks" CASCADE;
  DROP TABLE "skill_versions_findings" CASCADE;
  DROP TABLE "skill_versions_compatibility" CASCADE;
  DROP TABLE "skill_versions" CASCADE;
  DROP TABLE "skill_versions_locales" CASCADE;
  DROP TABLE "skill_versions_texts" CASCADE;
  DROP TABLE "agent_hosts" CASCADE;
  DROP TABLE "agent_hosts_locales" CASCADE;
  DROP TABLE "skill_tags" CASCADE;
  DROP TABLE "skill_tags_locales" CASCADE;
  DROP TABLE "skill_submissions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_skills_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_skill_versions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_agent_hosts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_skill_tags_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_skill_submissions_fk";
  
  DROP INDEX "payload_locked_documents_rels_skills_id_idx";
  DROP INDEX "payload_locked_documents_rels_skill_versions_id_idx";
  DROP INDEX "payload_locked_documents_rels_agent_hosts_id_idx";
  DROP INDEX "payload_locked_documents_rels_skill_tags_id_idx";
  DROP INDEX "payload_locked_documents_rels_skill_submissions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "skills_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "skill_versions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "agent_hosts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "skill_tags_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "skill_submissions_id";
  DROP TYPE "public"."enum_skills_status";
  DROP TYPE "public"."enum_skills_category";
  DROP TYPE "public"."enum_skill_versions_checks_result";
  DROP TYPE "public"."enum_skill_versions_findings_severity";
  DROP TYPE "public"."enum_skill_versions_compatibility_status";
  DROP TYPE "public"."enum_skill_versions_status";
  DROP TYPE "public"."enum_skill_versions_scan_status";
  DROP TYPE "public"."enum_skill_submissions_status";`)
}
