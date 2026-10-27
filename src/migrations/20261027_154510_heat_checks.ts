import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "heat_checks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer NOT NULL,
  	"kind" text NOT NULL,
  	"hits" integer DEFAULT 0 NOT NULL,
  	"engagement" integer DEFAULT 0 NOT NULL,
  	"weight" real DEFAULT 0 NOT NULL,
  	"details" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "heat_checks" ADD CONSTRAINT "heat_checks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "heat_checks_event_kind_idx" ON "heat_checks" USING btree ("event_id","kind","checked_at");
  CREATE INDEX "heat_checks_checked_idx" ON "heat_checks" USING btree ("checked_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "heat_checks" CASCADE;`)
}
