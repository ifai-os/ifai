import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "email_sends" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subscriber_id" integer,
  	"local_date" date NOT NULL,
  	"locale" text NOT NULL,
  	"status" text NOT NULL,
  	"story_count" integer,
  	"resend_id" text,
  	"error" text,
  	"attempts" integer DEFAULT 1 NOT NULL,
  	"run_id" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"sent_at" timestamp with time zone,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_events" (
  	"id" text PRIMARY KEY NOT NULL,
  	"type" text NOT NULL,
  	"received_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "resend_state" (
  	"id" integer PRIMARY KEY NOT NULL,
  	"daily_used" integer,
  	"monthly_used" integer,
  	"read_at" timestamp with time zone,
  	"last_error" text,
  	"last_error_at" timestamp with time zone
  );
  
  CREATE UNIQUE INDEX "email_sends_subscriber_date_idx" ON "email_sends" USING btree ("subscriber_id","local_date");
  CREATE INDEX "email_sends_resend_idx" ON "email_sends" USING btree ("resend_id");
  CREATE INDEX "email_sends_run_idx" ON "email_sends" USING btree ("run_id");
  CREATE INDEX "email_sends_created_idx" ON "email_sends" USING btree ("created_at");
  CREATE INDEX "email_events_received_idx" ON "email_events" USING btree ("received_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "email_sends" CASCADE;
  DROP TABLE "email_events" CASCADE;
  DROP TABLE "resend_state" CASCADE;`)
}
