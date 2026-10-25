import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "member_blocks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"blocker_id" text NOT NULL,
  	"blocked_id" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" text NOT NULL,
  	"reporter" text NOT NULL,
  	"reason" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"resolved_at" timestamp with time zone
  );
  
  ALTER TABLE "member_old_handles" ADD COLUMN "retired_at" timestamp with time zone;
  ALTER TABLE "member_blocks" ADD CONSTRAINT "member_blocks_blocker_id_auth_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "member_blocks" ADD CONSTRAINT "member_blocks_blocked_id_auth_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "member_blocks_blocker_blocked_idx" ON "member_blocks" USING btree ("blocker_id","blocked_id");
  CREATE INDEX "member_blocks_blocked_idx" ON "member_blocks" USING btree ("blocked_id");
  CREATE UNIQUE INDEX "member_reports_user_reporter_idx" ON "member_reports" USING btree ("user_id","reporter");
  CREATE INDEX "member_reports_resolved_idx" ON "member_reports" USING btree ("resolved_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "member_blocks" CASCADE;
  DROP TABLE "member_reports" CASCADE;
  ALTER TABLE "member_old_handles" DROP COLUMN "retired_at";`)
}
