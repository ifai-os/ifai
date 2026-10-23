import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "saves" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" text NOT NULL,
  	"target_type" text NOT NULL,
  	"target_id" integer NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "saves_user_target_idx" ON "saves" USING btree ("user_id","target_type","target_id");
  CREATE INDEX "saves_target_idx" ON "saves" USING btree ("target_type","target_id");
  CREATE INDEX "saves_type_created_idx" ON "saves" USING btree ("target_type","created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "saves" CASCADE;`)
}
