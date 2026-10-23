import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "app_review_translations" (
  	"review_id" integer PRIMARY KEY NOT NULL,
  	"source" text NOT NULL,
  	"status" text NOT NULL,
  	"language" text,
  	"texts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"model" text,
  	"error" text,
  	"runs_day" date,
  	"runs" smallint DEFAULT 0 NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "app_review_translations" ADD CONSTRAINT "app_review_translations_review_id_app_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."app_reviews"("id") ON DELETE cascade ON UPDATE no action;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "app_review_translations" CASCADE;`)
}
