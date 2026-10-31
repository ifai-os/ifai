import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "rankings_external_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source" text NOT NULL,
  	"board" text NOT NULL,
  	"published_on" date NOT NULL,
  	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"models" integer NOT NULL,
  	"checksum" text NOT NULL
  );
  
  CREATE TABLE "rankings_external_rows" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"snapshot_id" integer NOT NULL,
  	"rank" integer NOT NULL,
  	"model" text NOT NULL,
  	"org" text,
  	"license" text,
  	"weights" text,
  	"score" double precision NOT NULL,
  	"lower" double precision,
  	"upper" double precision,
  	"votes" integer
  );
  
  ALTER TABLE "rankings_external_rows" ADD CONSTRAINT "rankings_external_rows_snapshot_id_rankings_external_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."rankings_external_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "rankings_external_snapshots_board_day_idx" ON "rankings_external_snapshots" USING btree ("source","board","published_on");
  CREATE INDEX "rankings_external_rows_snapshot_idx" ON "rankings_external_rows" USING btree ("snapshot_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "rankings_external_snapshots" CASCADE;
  DROP TABLE "rankings_external_rows" CASCADE;`)
}
