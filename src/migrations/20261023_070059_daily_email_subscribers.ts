import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_subscribers_locale" AS ENUM('en', 'zh-Hans', 'zh-Hant', 'ja', 'ko');
  CREATE TYPE "public"."enum_subscribers_status" AS ENUM('subscribed', 'unsubscribed', 'stopped');
  CREATE TYPE "public"."enum_subscribers_stop_reason" AS ENUM('bounce', 'complaint', 'owner');
  CREATE TABLE "subscribe_attempts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"visitor_hash" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subscribers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"locale" "enum_subscribers_locale" NOT NULL,
  	"time_zone" varchar DEFAULT 'UTC' NOT NULL,
  	"status" "enum_subscribers_status" DEFAULT 'subscribed' NOT NULL,
  	"stop_reason" "enum_subscribers_stop_reason",
  	"source_page" varchar,
  	"subscribed_at" timestamp(3) with time zone,
  	"unsubscribed_at" timestamp(3) with time zone,
  	"welcome_sent_at" timestamp(3) with time zone,
  	"last_sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscribers_id" integer;
  CREATE INDEX "subscribe_attempts_visitor_idx" ON "subscribe_attempts" USING btree ("visitor_hash","created_at");
  CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" USING btree ("email");
  CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("status");
  CREATE INDEX "subscribers_subscribed_at_idx" ON "subscribers" USING btree ("subscribed_at");
  CREATE INDEX "subscribers_unsubscribed_at_idx" ON "subscribers" USING btree ("unsubscribed_at");
  CREATE INDEX "subscribers_updated_at_idx" ON "subscribers" USING btree ("updated_at");
  CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscribers_fk" FOREIGN KEY ("subscribers_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_subscribers_id_idx" ON "payload_locked_documents_rels" USING btree ("subscribers_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "subscribe_attempts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subscribers" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "subscribe_attempts" CASCADE;
  DROP TABLE "subscribers" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_subscribers_fk";
  
  DROP INDEX "payload_locked_documents_rels_subscribers_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscribers_id";
  DROP TYPE "public"."enum_subscribers_locale";
  DROP TYPE "public"."enum_subscribers_status";
  DROP TYPE "public"."enum_subscribers_stop_reason";`)
}
