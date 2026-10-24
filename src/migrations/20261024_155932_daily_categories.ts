import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // The UPDATE is written by hand: while the column is text, stories of the former categories
  // move to the new ones (「产品更新」→「AI工具」,「图像与设计」→「AIGC」; docs/specs/daily.md「分类与分类页」).
  await db.execute(sql`
   ALTER TABLE "stories" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "public"."enum_stories_category";
  UPDATE "stories" SET "category" = CASE "category" WHEN 'product' THEN 'tools' ELSE 'aigc' END WHERE "category" IN ('product', 'design');
  CREATE TYPE "public"."enum_stories_category" AS ENUM('llm', 'tools', 'aigc', 'open', 'industry', 'research', 'robotics');
  ALTER TABLE "stories" ALTER COLUMN "category" SET DATA TYPE "public"."enum_stories_category" USING "category"::"public"."enum_stories_category";`)
  // Also by hand: events and structuring results keep their category as text and JSON, which Payload does not see.
  await db.execute(sql`
  UPDATE "events" SET "category" = CASE "category" WHEN 'product' THEN 'tools' ELSE 'aigc' END WHERE "category" IN ('product', 'design');
  UPDATE "item_analyses" SET "structure" = jsonb_set("structure", '{category}', to_jsonb(CASE "structure"->>'category' WHEN 'product' THEN 'tools' ELSE 'aigc' END))
    WHERE "structure"->>'category' IN ('product', 'design');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // By hand, as above: back to the nearest former category (AI models and AI tools were「产品更新」, robots「行业动态」).
  await db.execute(sql`
   ALTER TABLE "stories" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "public"."enum_stories_category";
  UPDATE "stories" SET "category" = CASE "category" WHEN 'aigc' THEN 'design' WHEN 'robotics' THEN 'industry' ELSE 'product' END
    WHERE "category" IN ('llm', 'tools', 'aigc', 'robotics');
  CREATE TYPE "public"."enum_stories_category" AS ENUM('product', 'industry', 'open', 'design', 'research');
  ALTER TABLE "stories" ALTER COLUMN "category" SET DATA TYPE "public"."enum_stories_category" USING "category"::"public"."enum_stories_category";`)
  await db.execute(sql`
  UPDATE "events" SET "category" = CASE "category" WHEN 'aigc' THEN 'design' WHEN 'robotics' THEN 'industry' ELSE 'product' END
    WHERE "category" IN ('llm', 'tools', 'aigc', 'robotics');
  UPDATE "item_analyses" SET "structure" = jsonb_set("structure", '{category}', to_jsonb(CASE "structure"->>'category' WHEN 'aigc' THEN 'design' WHEN 'robotics' THEN 'industry' ELSE 'product' END))
    WHERE "structure"->>'category' IN ('llm', 'tools', 'aigc', 'robotics');`)
}
