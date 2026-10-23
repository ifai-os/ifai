import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posters_status" AS ENUM('draft', 'generated');
  CREATE TABLE "posters" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" varchar NOT NULL,
  	"arranged" boolean DEFAULT false,
  	"status" "enum_posters_status" DEFAULT 'draft' NOT NULL,
  	"generated_at" timestamp(3) with time zone,
  	"snapshot" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "posters_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"stories_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "posters_id" integer;
  ALTER TABLE "posters_rels" ADD CONSTRAINT "posters_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posters_rels" ADD CONSTRAINT "posters_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "posters_date_idx" ON "posters" USING btree ("date");
  CREATE INDEX "posters_updated_at_idx" ON "posters" USING btree ("updated_at");
  CREATE INDEX "posters_created_at_idx" ON "posters" USING btree ("created_at");
  CREATE INDEX "posters_rels_order_idx" ON "posters_rels" USING btree ("order");
  CREATE INDEX "posters_rels_parent_idx" ON "posters_rels" USING btree ("parent_id");
  CREATE INDEX "posters_rels_path_idx" ON "posters_rels" USING btree ("path");
  CREATE INDEX "posters_rels_stories_id_idx" ON "posters_rels" USING btree ("stories_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posters_fk" FOREIGN KEY ("posters_id") REFERENCES "public"."posters"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_posters_id_idx" ON "payload_locked_documents_rels" USING btree ("posters_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered by hand: dropping the collection tables with CASCADE already removes the
  // lock-table constraint, so the generated order (tables first) failed on DROP CONSTRAINT.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_posters_fk";
  DROP INDEX "payload_locked_documents_rels_posters_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "posters_id";
  ALTER TABLE "posters" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posters_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posters" CASCADE;
  DROP TABLE "posters_rels" CASCADE;
  DROP TYPE "public"."enum_posters_status";`)
}
