import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { toHant } from '../lib/i18n/hant'

/**
 * The 图像生成 arena of docs/specs/rankings.md (step 2): answers are pictures. It starts as a
 * draft, so it opens only after the site owner has added models that draw, questions, and the
 * pictures are in. zh-Hant is converted from zh-Hans with OpenCC. Kept inline so this migration
 * stays frozen even if the collection changes later.
 */
const arena = {
  slug: 'image',
  name: { en: 'Image generation', hans: '图像生成', ja: '画像生成', ko: '이미지 생성' },
  intro: {
    en: 'Drawing one picture from a written description.',
    hans: '按一段文字描述画一张图。',
    ja: '文章の説明どおりに画像を1枚描く。',
    ko: '글로 쓴 설명대로 이미지 한 장 그리기.',
  },
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_arenas_kind" AS ENUM('text', 'image');
  CREATE TABLE "arena_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"prefix" varchar DEFAULT 'arena',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumb_url" varchar,
  	"sizes_thumb_width" numeric,
  	"sizes_thumb_height" numeric,
  	"sizes_thumb_mime_type" varchar,
  	"sizes_thumb_filesize" numeric,
  	"sizes_thumb_filename" varchar,
  	"sizes_vote_url" varchar,
  	"sizes_vote_width" numeric,
  	"sizes_vote_height" numeric,
  	"sizes_vote_mime_type" varchar,
  	"sizes_vote_filesize" numeric,
  	"sizes_vote_filename" varchar
  );
  
  ALTER TABLE "arenas" ADD COLUMN "kind" "enum_arenas_kind" DEFAULT 'text' NOT NULL;
  ALTER TABLE "arena_answers" ADD COLUMN "image_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "arena_images_id" integer;
  CREATE INDEX "arena_images_updated_at_idx" ON "arena_images" USING btree ("updated_at");
  CREATE INDEX "arena_images_created_at_idx" ON "arena_images" USING btree ("created_at");
  CREATE UNIQUE INDEX "arena_images_filename_idx" ON "arena_images" USING btree ("filename");
  CREATE INDEX "arena_images_sizes_thumb_sizes_thumb_filename_idx" ON "arena_images" USING btree ("sizes_thumb_filename");
  CREATE INDEX "arena_images_sizes_vote_sizes_vote_filename_idx" ON "arena_images" USING btree ("sizes_vote_filename");
  ALTER TABLE "arena_answers" ADD CONSTRAINT "arena_answers_image_id_arena_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."arena_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_arena_images_fk" FOREIGN KEY ("arena_images_id") REFERENCES "public"."arena_images"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "arena_answers_image_idx" ON "arena_answers" USING btree ("image_id");
  CREATE INDEX "payload_locked_documents_rels_arena_images_id_idx" ON "payload_locked_documents_rels" USING btree ("arena_images_id");`)

  const texts = (['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const).map((locale) => {
    const pick = (text: { en: string; hans: string; ja: string; ko: string }) =>
      locale === 'zh-Hans' ? text.hans : locale === 'zh-Hant' ? toHant(text.hans) : text[locale]
    return sql`(${locale}, ${pick(arena.name)}, ${pick(arena.intro)})`
  })
  // After 文本 and 编程; left alone if the site owner already made an arena with this slug.
  await db.execute(sql`
    WITH arena AS (
      INSERT INTO "arenas" ("slug", "status", "kind", "order") VALUES (${arena.slug}, 'draft', 'image', 3)
      ON CONFLICT ("slug") DO NOTHING RETURNING "id"
    )
    INSERT INTO "arenas_locales" ("name", "intro", "_locale", "_parent_id")
    SELECT v.name, v.intro, v.locale::"_locales", arena.id FROM arena, (VALUES ${sql.join(texts, sql`, `)}) AS v(locale, name, intro)`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The arena goes too, unless it has questions by now.
  await db.execute(sql`
    DELETE FROM "arenas" WHERE "slug" = ${arena.slug} AND "kind" = 'image'
    AND NOT EXISTS (SELECT 1 FROM "arena_prompts" WHERE "arena_prompts"."arena_id" = "arenas"."id")`)
  await db.execute(sql`
   ALTER TABLE "arena_images" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "arena_images" CASCADE;
  ALTER TABLE "arena_answers" DROP CONSTRAINT IF EXISTS "arena_answers_image_id_arena_images_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_arena_images_fk";
  
  DROP INDEX "arena_answers_image_idx";
  DROP INDEX "payload_locked_documents_rels_arena_images_id_idx";
  ALTER TABLE "arenas" DROP COLUMN "kind";
  ALTER TABLE "arena_answers" DROP COLUMN "image_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "arena_images_id";
  DROP TYPE "public"."enum_arenas_kind";`)
}
