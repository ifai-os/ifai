import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stories_tags" AS ENUM('llm', 'assistants', 'agents', 'coding', 'image', 'video', 'audio', 'search', 'chips', 'on-device', 'devices', 'robotics', 'driving', 'health', 'education', 'finance', 'enterprise', 'security', 'policy', 'deals');
  CREATE TYPE "public"."enum_stories_entities_kind" AS ENUM('company', 'product');
  CREATE TABLE "stories_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_stories_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "stories_entities" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_stories_entities_kind" DEFAULT 'product' NOT NULL,
  	"key" varchar
  );
  
  ALTER TABLE "stories_tags" ADD CONSTRAINT "stories_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stories_entities" ADD CONSTRAINT "stories_entities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "stories_tags_order_idx" ON "stories_tags" USING btree ("order");
  CREATE INDEX "stories_tags_parent_idx" ON "stories_tags" USING btree ("parent_id");
  CREATE INDEX "stories_entities_order_idx" ON "stories_entities" USING btree ("_order");
  CREATE INDEX "stories_entities_parent_id_idx" ON "stories_entities" USING btree ("_parent_id");
  CREATE INDEX "stories_entities_key_idx" ON "stories_entities" USING btree ("key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "stories_tags" CASCADE;
  DROP TABLE "stories_entities" CASCADE;
  DROP TYPE "public"."enum_stories_tags";
  DROP TYPE "public"."enum_stories_entities_kind";`)
}
