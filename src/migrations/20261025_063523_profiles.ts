import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "member_profiles" (
  	"user_id" text PRIMARY KEY NOT NULL,
  	"bio" text DEFAULT '' NOT NULL,
  	"bio_lang" text,
  	"website" text,
  	"handle_changed_at" timestamp with time zone,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_old_handles" (
  	"handle" text PRIMARY KEY NOT NULL,
  	"user_id" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_follows" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"follower_id" text NOT NULL,
  	"followee_id" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "member_old_handles" ADD CONSTRAINT "member_old_handles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "member_follows" ADD CONSTRAINT "member_follows_follower_id_auth_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "member_follows" ADD CONSTRAINT "member_follows_followee_id_auth_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "member_old_handles_user_idx" ON "member_old_handles" USING btree ("user_id");
  CREATE UNIQUE INDEX "member_follows_follower_followee_idx" ON "member_follows" USING btree ("follower_id","followee_id");
  CREATE INDEX "member_follows_followee_idx" ON "member_follows" USING btree ("followee_id","id");
  CREATE INDEX "member_follows_follower_created_idx" ON "member_follows" USING btree ("follower_id","created_at");`)
  // Members who signed up before profiles get the kind of address new members get (docs/specs/circles.md
  // rule 18, src/modules/profiles/handles.ts): `u-` and ten hex digits.
  await db.execute(sql`
   UPDATE "auth_users" SET "handle" = 'u-' || substr(md5(random()::text || "id"), 1, 10) WHERE "handle" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "member_profiles" CASCADE;
  DROP TABLE "member_old_handles" CASCADE;
  DROP TABLE "member_follows" CASCADE;`)
}
