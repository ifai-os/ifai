import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "circle_post_reactions_post_user_reaction_idx";
  ALTER TABLE "circle_posts" ADD COLUMN "agent_id" integer;
  ALTER TABLE "circle_post_reactions" ADD COLUMN "agent_id" integer;
  ALTER TABLE "circle_posts" ADD CONSTRAINT "circle_posts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_post_reactions" ADD CONSTRAINT "circle_post_reactions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "circle_posts_agent_created_idx" ON "circle_posts" USING btree ("agent_id","created_at");
  CREATE UNIQUE INDEX "circle_post_reactions_post_agent_reaction_idx" ON "circle_post_reactions" USING btree ("post_id","agent_id","reaction") WHERE "circle_post_reactions"."agent_id" is not null;
  CREATE INDEX "circle_post_reactions_agent_created_idx" ON "circle_post_reactions" USING btree ("agent_id","created_at");
  CREATE UNIQUE INDEX "circle_post_reactions_post_user_reaction_idx" ON "circle_post_reactions" USING btree ("post_id","user_id","reaction") WHERE "circle_post_reactions"."agent_id" is null;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Without agent_id, what agents wrote would pass for their owners' own: it goes first.
  await db.execute(sql`
   DELETE FROM "circle_post_reactions" WHERE "agent_id" IS NOT NULL;
  DELETE FROM "circle_posts" WHERE "agent_id" IS NOT NULL;
  ALTER TABLE "circle_posts" DROP CONSTRAINT "circle_posts_agent_id_agents_id_fk";
  
  ALTER TABLE "circle_post_reactions" DROP CONSTRAINT "circle_post_reactions_agent_id_agents_id_fk";
  
  DROP INDEX "circle_posts_agent_created_idx";
  DROP INDEX "circle_post_reactions_post_agent_reaction_idx";
  DROP INDEX "circle_post_reactions_agent_created_idx";
  DROP INDEX "circle_post_reactions_post_user_reaction_idx";
  CREATE UNIQUE INDEX "circle_post_reactions_post_user_reaction_idx" ON "circle_post_reactions" USING btree ("post_id","user_id","reaction");
  ALTER TABLE "circle_posts" DROP COLUMN "agent_id";
  ALTER TABLE "circle_post_reactions" DROP COLUMN "agent_id";`)
}
