import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "app_reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"app_id" integer NOT NULL,
  	"user_id" text NOT NULL,
  	"rating" smallint NOT NULL,
  	"body" text NOT NULL,
  	"lang" text NOT NULL,
  	"status" text DEFAULT 'shown' NOT NULL,
  	"edited_at" timestamp with time zone,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app_review_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"review_id" integer NOT NULL,
  	"reporter" text NOT NULL,
  	"reason" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"resolved_at" timestamp with time zone
  );
  
  ALTER TABLE "app_reviews" ADD CONSTRAINT "app_reviews_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_review_reports" ADD CONSTRAINT "app_review_reports_review_id_app_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."app_reviews"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "app_reviews_app_user_idx" ON "app_reviews" USING btree ("app_id","user_id");
  CREATE INDEX "app_reviews_app_status_idx" ON "app_reviews" USING btree ("app_id","status","id");
  CREATE INDEX "app_reviews_user_created_idx" ON "app_reviews" USING btree ("user_id","created_at");
  CREATE UNIQUE INDEX "app_review_reports_review_reporter_idx" ON "app_review_reports" USING btree ("review_id","reporter");
  CREATE INDEX "app_review_reports_resolved_idx" ON "app_review_reports" USING btree ("resolved_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "app_reviews" CASCADE;
  DROP TABLE "app_review_reports" CASCADE;`)
}
