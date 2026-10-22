import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // pgvector, for the daily module's similarity search (raw_items vectors). Written by hand:
  // Payload does not generate extension statements.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`)

  await db.execute(sql`
   CREATE TABLE "model_receipts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"purpose" text NOT NULL,
  	"input_hash" text NOT NULL,
  	"model" text NOT NULL,
  	"subject" text,
  	"status" text NOT NULL,
  	"attempts" integer DEFAULT 1 NOT NULL,
  	"output" jsonb,
  	"error" text,
  	"input_tokens" integer DEFAULT 0 NOT NULL,
  	"output_tokens" integer DEFAULT 0 NOT NULL,
  	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"completed_at" timestamp with time zone
  );
  
  CREATE UNIQUE INDEX "model_receipts_purpose_input_hash_idx" ON "model_receipts" USING btree ("purpose","input_hash");
  CREATE INDEX "model_receipts_completed_at_idx" ON "model_receipts" USING btree ("completed_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "model_receipts" CASCADE;`)

  await db.execute(sql`DROP EXTENSION IF EXISTS vector;`)
}
