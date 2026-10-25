import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "follows" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" text NOT NULL,
  	"target_type" text NOT NULL,
  	"target_key" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "follows_user_target_idx" ON "follows" USING btree ("user_id","target_type","target_key");
  CREATE INDEX "follows_target_idx" ON "follows" USING btree ("target_type","target_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "follows" CASCADE;`)
}
