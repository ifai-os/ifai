import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" ADD COLUMN "approved_at" timestamp(3) with time zone;`)
  // The UPDATEs are written by hand (docs/specs/daily.md「发布时间」). Until now the publish time was the
  // approval: keep it as the approval time, then move the publish time back to the news source's, the
  // original's when it has one, else the earliest other source's, never later than the approval. The
  // apps' mentions of a story carry its publish time, so they follow.
  await db.execute(sql`
  UPDATE "stories" SET "approved_at" = "published_at" WHERE "published_at" IS NOT NULL;
  UPDATE "stories" SET "published_at" = "times"."source"
    FROM (
      SELECT "stories"."id",
        coalesce(min("stories_sources"."published_at") FILTER (WHERE "stories_sources"."role" = 'original'), min("stories_sources"."published_at")) AS "source"
      FROM "stories"
      JOIN "stories_sources" ON "stories_sources"."_parent_id" = "stories"."id"
        AND "stories_sources"."published_at" <= "stories"."published_at"
      GROUP BY "stories"."id"
    ) AS "times"
    WHERE "stories"."id" = "times"."id" AND "times"."source" < "stories"."published_at";
  UPDATE "app_mentions" SET "published_at" = "stories"."published_at"
    FROM "stories"
    WHERE "app_mentions"."story_id" = "stories"."id" AND "stories"."published_at" IS NOT NULL
      AND "app_mentions"."published_at" <> "stories"."published_at";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // By hand, as above: the publish time goes back to the approval, and the mentions with it.
  await db.execute(sql`
  UPDATE "stories" SET "published_at" = "approved_at" WHERE "approved_at" IS NOT NULL;
  UPDATE "app_mentions" SET "published_at" = "stories"."published_at"
    FROM "stories"
    WHERE "app_mentions"."story_id" = "stories"."id" AND "stories"."published_at" IS NOT NULL
      AND "app_mentions"."published_at" <> "stories"."published_at";
   ALTER TABLE "stories" DROP COLUMN "approved_at";`)
}
