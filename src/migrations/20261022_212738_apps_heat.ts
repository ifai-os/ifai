import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "app_clicks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"app_id" integer NOT NULL,
  	"day" date NOT NULL,
  	"visitor_hash" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app_mentions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"app_id" integer NOT NULL,
  	"story_id" integer NOT NULL,
  	"event_id" integer,
  	"basis" text NOT NULL,
  	"matched" text NOT NULL,
  	"published_at" timestamp with time zone NOT NULL,
  	"removed_at" timestamp with time zone,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app_metrics_daily" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"app_id" integer NOT NULL,
  	"day" date NOT NULL,
  	"category_id" integer,
  	"tranco_rank" integer,
  	"tranco_domain" text,
  	"tranco_list_id" text,
  	"clicks" integer DEFAULT 0 NOT NULL,
  	"saves" integer DEFAULT 0 NOT NULL,
  	"mentions" integer DEFAULT 0 NOT NULL,
  	"rank_score" smallint NOT NULL,
  	"engagement_score" smallint NOT NULL,
  	"mention_score" smallint NOT NULL,
  	"heat" smallint NOT NULL,
  	"change_7d" smallint,
  	"rank_overall" integer NOT NULL,
  	"rank_category" integer,
  	"rank_rising" integer,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app_heat_runs" (
  	"day" date PRIMARY KEY NOT NULL,
  	"status" text NOT NULL,
  	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"finished_at" timestamp with time zone,
  	"tranco_status" text,
  	"tranco_list_id" text,
  	"tranco_error" text,
  	"apps" integer,
  	"mentions" integer,
  	"error" text
  );
  
  CREATE UNIQUE INDEX "app_clicks_app_day_visitor_idx" ON "app_clicks" USING btree ("app_id","day","visitor_hash");
  CREATE INDEX "app_clicks_day_idx" ON "app_clicks" USING btree ("day");
  CREATE UNIQUE INDEX "app_mentions_app_story_idx" ON "app_mentions" USING btree ("app_id","story_id");
  CREATE INDEX "app_mentions_app_published_idx" ON "app_mentions" USING btree ("app_id","published_at");
  CREATE INDEX "app_mentions_published_idx" ON "app_mentions" USING btree ("published_at");
  CREATE UNIQUE INDEX "app_metrics_daily_app_day_idx" ON "app_metrics_daily" USING btree ("app_id","day");
  CREATE INDEX "app_metrics_daily_day_idx" ON "app_metrics_daily" USING btree ("day");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "app_clicks" CASCADE;
  DROP TABLE "app_mentions" CASCADE;
  DROP TABLE "app_metrics_daily" CASCADE;
  DROP TABLE "app_heat_runs" CASCADE;`)
}
