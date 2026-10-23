import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_app_reports_kind" AS ENUM('wrong-info', 'shut-down', 'other');
  CREATE TYPE "public"."enum_app_reports_page_locale" AS ENUM('en', 'zh-Hans', 'zh-Hant', 'ja', 'ko');
  CREATE TYPE "public"."enum_app_reports_status" AS ENUM('open', 'resolved');
  CREATE TABLE "app_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"app_id" integer NOT NULL,
  	"kind" "enum_app_reports_kind" NOT NULL,
  	"body" varchar,
  	"contact" varchar,
  	"page_locale" "enum_app_reports_page_locale",
  	"reporter" varchar NOT NULL,
  	"status" "enum_app_reports_status" DEFAULT 'open' NOT NULL,
  	"resolved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "app_reports_id" integer;
  ALTER TABLE "app_reports" ADD CONSTRAINT "app_reports_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "app_reports_app_idx" ON "app_reports" USING btree ("app_id");
  CREATE INDEX "app_reports_reporter_idx" ON "app_reports" USING btree ("reporter");
  CREATE INDEX "app_reports_status_idx" ON "app_reports" USING btree ("status");
  CREATE INDEX "app_reports_updated_at_idx" ON "app_reports" USING btree ("updated_at");
  CREATE INDEX "app_reports_created_at_idx" ON "app_reports" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_app_reports_fk" FOREIGN KEY ("app_reports_id") REFERENCES "public"."app_reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_app_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("app_reports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_reports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "app_reports" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_app_reports_fk";
  
  DROP INDEX "payload_locked_documents_rels_app_reports_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "app_reports_id";
  DROP TYPE "public"."enum_app_reports_kind";
  DROP TYPE "public"."enum_app_reports_page_locale";
  DROP TYPE "public"."enum_app_reports_status";`)
}
