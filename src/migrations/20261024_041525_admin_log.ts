import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "admin_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" timestamp with time zone DEFAULT now() NOT NULL,
  	"admin_id" integer,
  	"admin_email" text,
  	"kind" text NOT NULL,
  	"action" text,
  	"collection" text,
  	"doc_id" text,
  	"doc_title" text,
  	"detail" jsonb
  );
  
  CREATE INDEX "admin_log_at_idx" ON "admin_log" USING btree ("at");
  CREATE INDEX "admin_log_doc_idx" ON "admin_log" USING btree ("collection","doc_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "admin_log" CASCADE;`)
}
