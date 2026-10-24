import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "circle_comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"post_id" integer NOT NULL,
  	"user_id" text NOT NULL,
  	"parent_id" integer,
  	"reply_to_id" integer,
  	"body" text NOT NULL,
  	"lang" text NOT NULL,
  	"status" text DEFAULT 'shown' NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "circle_comment_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"comment_id" integer NOT NULL,
  	"reporter" text NOT NULL,
  	"reason" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"resolved_at" timestamp with time zone
  );
  
  ALTER TABLE "circle_comments" ADD CONSTRAINT "circle_comments_post_id_circle_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."circle_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_comments" ADD CONSTRAINT "circle_comments_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_comments" ADD CONSTRAINT "circle_comments_parent_id_circle_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."circle_comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_comments" ADD CONSTRAINT "circle_comments_reply_to_id_circle_comments_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."circle_comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "circle_comment_reports" ADD CONSTRAINT "circle_comment_reports_comment_id_circle_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."circle_comments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "circle_comments_post_idx" ON "circle_comments" USING btree ("post_id","parent_id","id");
  CREATE INDEX "circle_comments_parent_idx" ON "circle_comments" USING btree ("parent_id","id");
  CREATE INDEX "circle_comments_reply_to_idx" ON "circle_comments" USING btree ("reply_to_id");
  CREATE INDEX "circle_comments_user_created_idx" ON "circle_comments" USING btree ("user_id","created_at");
  CREATE UNIQUE INDEX "circle_comment_reports_comment_reporter_idx" ON "circle_comment_reports" USING btree ("comment_id","reporter");
  CREATE INDEX "circle_comment_reports_resolved_idx" ON "circle_comment_reports" USING btree ("resolved_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "circle_comments" CASCADE;
  DROP TABLE "circle_comment_reports" CASCADE;`)
}
