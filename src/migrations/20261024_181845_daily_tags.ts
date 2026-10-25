import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // The DELETE and UPDATE are written by hand: while the column is text, stories drop the tags that are
  // gone and the renamed ones move over (编程与开发 → VibeCoding, 语音与音乐 → AI语音, 消费电子 → AI硬件;
  // docs/specs/daily.md「行业标签」).
  await db.execute(sql`
   ALTER TABLE "stories_tags" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_stories_tags";
  DELETE FROM "stories_tags" WHERE "value" IN ('llm', 'search', 'robotics', 'driving', 'finance', 'enterprise', 'policy');
  UPDATE "stories_tags" SET "value" = CASE "value" WHEN 'coding' THEN 'vibe-coding' WHEN 'audio' THEN 'voice' ELSE 'hardware' END
    WHERE "value" IN ('coding', 'audio', 'devices');
  CREATE TYPE "public"."enum_stories_tags" AS ENUM('assistants', 'agents', 'vibe-coding', 'image', 'video', 'music', 'voice', 'chips', 'on-device', 'hardware', 'health', 'education', 'security', 'deals');
  ALTER TABLE "stories_tags" ALTER COLUMN "value" SET DATA TYPE "public"."enum_stories_tags" USING "value"::"public"."enum_stories_tags";`)
  // Also by hand: structuring results keep their tags in JSON, which Payload does not see. Tags that are gone
  // can stay there: writing a story keeps only the known ones (tagsOf).
  await db.execute(sql`
  UPDATE "item_analyses" SET "structure" = jsonb_set("structure", '{tags}', (
      SELECT jsonb_agg(CASE "tag" WHEN 'coding' THEN 'vibe-coding' WHEN 'audio' THEN 'voice' WHEN 'devices' THEN 'hardware' ELSE "tag" END ORDER BY "position")
      FROM jsonb_array_elements_text("structure"->'tags') WITH ORDINALITY AS "tags"("tag", "position")))
    WHERE jsonb_typeof("structure"->'tags') = 'array' AND "structure"->'tags' ?| array['coding', 'audio', 'devices'];`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // By hand, as above: back to the former tags. AI音乐 and AI语音 both become 语音与音乐, once per story.
  await db.execute(sql`
   ALTER TABLE "stories_tags" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_stories_tags";
  DELETE FROM "stories_tags" AS "music" USING "stories_tags" AS "voice"
    WHERE "music"."parent_id" = "voice"."parent_id" AND "music"."value" = 'music' AND "voice"."value" = 'voice';
  UPDATE "stories_tags" SET "value" = CASE "value" WHEN 'vibe-coding' THEN 'coding' WHEN 'hardware' THEN 'devices' ELSE 'audio' END
    WHERE "value" IN ('vibe-coding', 'hardware', 'music', 'voice');
  CREATE TYPE "public"."enum_stories_tags" AS ENUM('llm', 'assistants', 'agents', 'coding', 'image', 'video', 'audio', 'search', 'chips', 'on-device', 'devices', 'robotics', 'driving', 'health', 'education', 'finance', 'enterprise', 'security', 'policy', 'deals');
  ALTER TABLE "stories_tags" ALTER COLUMN "value" SET DATA TYPE "public"."enum_stories_tags" USING "value"::"public"."enum_stories_tags";`)
  await db.execute(sql`
  UPDATE "item_analyses" SET "structure" = jsonb_set("structure", '{tags}', (
      SELECT jsonb_agg(CASE "tag" WHEN 'vibe-coding' THEN 'coding' WHEN 'hardware' THEN 'devices' WHEN 'music' THEN 'audio' WHEN 'voice' THEN 'audio' ELSE "tag" END ORDER BY "position")
      FROM jsonb_array_elements_text("structure"->'tags') WITH ORDINALITY AS "tags"("tag", "position")))
    WHERE jsonb_typeof("structure"->'tags') = 'array' AND "structure"->'tags' ?| array['vibe-coding', 'hardware', 'music', 'voice'];`)
}
