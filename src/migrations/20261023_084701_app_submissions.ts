import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_app_submissions_status" AS ENUM('pending', 'accepted', 'duplicate', 'rejected');
  CREATE TYPE "public"."enum_app_submissions_locale" AS ENUM('en', 'zh-Hans', 'zh-Hant', 'ja', 'ko');
  CREATE TYPE "public"."enum_app_submissions_notified_status" AS ENUM('pending', 'accepted', 'duplicate', 'rejected');
  CREATE TABLE "app_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar,
  	"status" "enum_app_submissions_status" DEFAULT 'pending' NOT NULL,
  	"app_id" integer,
  	"locale" "enum_app_submissions_locale" DEFAULT 'en',
  	"notified_status" "enum_app_submissions_notified_status",
  	"notified_at" timestamp(3) with time zone,
  	"name" varchar NOT NULL,
  	"website" varchar NOT NULL,
  	"domain" varchar,
  	"category_id" integer,
  	"note" varchar,
  	"email" varchar NOT NULL,
  	"submitter_id" varchar,
  	"reply" varchar,
  	"admin_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "app_submissions_id" integer;
  ALTER TABLE "app_submissions" ADD CONSTRAINT "app_submissions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_submissions" ADD CONSTRAINT "app_submissions_category_id_app_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."app_categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "app_submissions_code_idx" ON "app_submissions" USING btree ("code");
  CREATE INDEX "app_submissions_status_idx" ON "app_submissions" USING btree ("status");
  CREATE INDEX "app_submissions_app_idx" ON "app_submissions" USING btree ("app_id");
  CREATE INDEX "app_submissions_domain_idx" ON "app_submissions" USING btree ("domain");
  CREATE INDEX "app_submissions_category_idx" ON "app_submissions" USING btree ("category_id");
  CREATE INDEX "app_submissions_submitter_id_idx" ON "app_submissions" USING btree ("submitter_id");
  CREATE INDEX "app_submissions_updated_at_idx" ON "app_submissions" USING btree ("updated_at");
  CREATE INDEX "app_submissions_created_at_idx" ON "app_submissions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_app_submissions_fk" FOREIGN KEY ("app_submissions_id") REFERENCES "public"."app_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_app_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("app_submissions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_submissions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "app_submissions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_app_submissions_fk";
  
  DROP INDEX "payload_locked_documents_rels_app_submissions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "app_submissions_id";
  DROP TYPE "public"."enum_app_submissions_status";
  DROP TYPE "public"."enum_app_submissions_locale";
  DROP TYPE "public"."enum_app_submissions_notified_status";`)
}
