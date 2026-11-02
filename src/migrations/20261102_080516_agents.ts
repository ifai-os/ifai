import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "agents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" text NOT NULL,
  	"name" text NOT NULL,
  	"about" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"disabled_at" timestamp with time zone,
  	"disabled_reason" text
  );
  
  CREATE TABLE "agent_keys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"agent_id" integer NOT NULL,
  	"label" text,
  	"hint" text NOT NULL,
  	"hash" text NOT NULL,
  	"scope" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"expires_at" timestamp with time zone NOT NULL,
  	"last_used_at" timestamp with time zone,
  	"last_used_ip" text
  );
  
  CREATE TABLE "api_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"caller" text NOT NULL,
  	"minute" timestamp with time zone NOT NULL,
  	"count" integer DEFAULT 1 NOT NULL
  );
  
  ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "agents_user_idx" ON "agents" USING btree ("user_id");
  CREATE UNIQUE INDEX "agent_keys_hash_idx" ON "agent_keys" USING btree ("hash");
  CREATE INDEX "agent_keys_agent_idx" ON "agent_keys" USING btree ("agent_id");
  CREATE UNIQUE INDEX "api_requests_caller_minute_idx" ON "api_requests" USING btree ("caller","minute");
  CREATE INDEX "api_requests_minute_idx" ON "api_requests" USING btree ("minute");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "agents" CASCADE;
  DROP TABLE "agent_keys" CASCADE;
  DROP TABLE "api_requests" CASCADE;`)
}
