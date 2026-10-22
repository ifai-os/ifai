import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { toHant } from '../lib/i18n/hant'

/**
 * The eight categories of docs/specs/apps.md, in display order. zh-Hant is converted from
 * zh-Hans with OpenCC, never typed by hand. Kept inline so this migration stays frozen even
 * if the collection changes later.
 */
const categories = [
  { slug: 'assistants', en: 'AI assistants', hans: 'AI 助手', ja: 'AIアシスタント', ko: 'AI 어시스턴트' },
  { slug: 'search', en: 'Search & research', hans: '搜索与研究', ja: '検索・リサーチ', ko: '검색·리서치' },
  { slug: 'coding', en: 'Coding', hans: '编程', ja: 'コーディング', ko: '코딩' },
  { slug: 'design', en: 'Image & design', hans: '图像与设计', ja: '画像・デザイン', ko: '이미지·디자인' },
  { slug: 'video', en: 'Video & animation', hans: '视频与动画', ja: '動画・アニメーション', ko: '영상·애니메이션' },
  { slug: 'music', en: 'Music & audio', hans: '音乐与音频', ja: '音楽・オーディオ', ko: '음악·오디오' },
  { slug: 'writing', en: 'Writing & copy', hans: '写作与文案', ja: 'ライティング・コピー', ko: '글쓰기·카피' },
  { slug: 'productivity', en: 'Productivity', hans: '办公效率', ja: '仕事効率化', ko: '업무 효율' },
]

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_apps_platforms" AS ENUM('web', 'desktop', 'mobile', 'browser-extension', 'api');
  CREATE TYPE "public"."enum_apps_status" AS ENUM('draft', 'published', 'delisted');
  CREATE TYPE "public"."enum_apps_pricing" AS ENUM('free', 'freemium', 'paid', 'open-source');
  CREATE TABLE "app_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app_categories_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "apps_platforms" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_apps_platforms",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "apps_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"detail" varchar
  );
  
  CREATE TABLE "apps_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL
  );
  
  CREATE TABLE "apps" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"status" "enum_apps_status" DEFAULT 'draft' NOT NULL,
  	"listed_at" timestamp(3) with time zone,
  	"checked_at" timestamp(3) with time zone,
  	"website" varchar NOT NULL,
  	"domain" varchar,
  	"developer" varchar,
  	"primary_category_id" integer NOT NULL,
  	"pricing" "enum_apps_pricing",
  	"logo_id" integer,
  	"screenshot_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "apps_locales" (
  	"tagline" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "apps_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar,
  	"locale" "_locales"
  );
  
  CREATE TABLE "apps_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"app_categories_id" integer,
  	"apps_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "app_categories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "apps_id" integer;
  ALTER TABLE "app_categories_locales" ADD CONSTRAINT "app_categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."app_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_platforms" ADD CONSTRAINT "apps_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_features" ADD CONSTRAINT "apps_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_faqs" ADD CONSTRAINT "apps_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps" ADD CONSTRAINT "apps_primary_category_id_app_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "public"."app_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "apps" ADD CONSTRAINT "apps_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "apps" ADD CONSTRAINT "apps_screenshot_id_media_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "apps_locales" ADD CONSTRAINT "apps_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_texts" ADD CONSTRAINT "apps_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_rels" ADD CONSTRAINT "apps_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_rels" ADD CONSTRAINT "apps_rels_app_categories_fk" FOREIGN KEY ("app_categories_id") REFERENCES "public"."app_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_rels" ADD CONSTRAINT "apps_rels_apps_fk" FOREIGN KEY ("apps_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "app_categories_slug_idx" ON "app_categories" USING btree ("slug");
  CREATE INDEX "app_categories_updated_at_idx" ON "app_categories" USING btree ("updated_at");
  CREATE INDEX "app_categories_created_at_idx" ON "app_categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "app_categories_locales_locale_parent_id_unique" ON "app_categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "app_categories_locales_parent_id_idx" ON "app_categories_locales" USING btree ("_parent_id");
  CREATE INDEX "apps_platforms_order_idx" ON "apps_platforms" USING btree ("order");
  CREATE INDEX "apps_platforms_parent_idx" ON "apps_platforms" USING btree ("parent_id");
  CREATE INDEX "apps_features_order_idx" ON "apps_features" USING btree ("_order");
  CREATE INDEX "apps_features_parent_id_idx" ON "apps_features" USING btree ("_parent_id");
  CREATE INDEX "apps_features_locale_idx" ON "apps_features" USING btree ("_locale");
  CREATE INDEX "apps_faqs_order_idx" ON "apps_faqs" USING btree ("_order");
  CREATE INDEX "apps_faqs_parent_id_idx" ON "apps_faqs" USING btree ("_parent_id");
  CREATE INDEX "apps_faqs_locale_idx" ON "apps_faqs" USING btree ("_locale");
  CREATE UNIQUE INDEX "apps_slug_idx" ON "apps" USING btree ("slug");
  CREATE INDEX "apps_status_idx" ON "apps" USING btree ("status");
  CREATE INDEX "apps_domain_idx" ON "apps" USING btree ("domain");
  CREATE INDEX "apps_primary_category_idx" ON "apps" USING btree ("primary_category_id");
  CREATE INDEX "apps_logo_idx" ON "apps" USING btree ("logo_id");
  CREATE INDEX "apps_screenshot_idx" ON "apps" USING btree ("screenshot_id");
  CREATE INDEX "apps_updated_at_idx" ON "apps" USING btree ("updated_at");
  CREATE INDEX "apps_created_at_idx" ON "apps" USING btree ("created_at");
  CREATE UNIQUE INDEX "apps_locales_locale_parent_id_unique" ON "apps_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "apps_locales_parent_id_idx" ON "apps_locales" USING btree ("_parent_id");
  CREATE INDEX "apps_texts_order_parent" ON "apps_texts" USING btree ("order","parent_id");
  CREATE INDEX "apps_texts_locale_parent" ON "apps_texts" USING btree ("locale","parent_id");
  CREATE INDEX "apps_rels_order_idx" ON "apps_rels" USING btree ("order");
  CREATE INDEX "apps_rels_parent_idx" ON "apps_rels" USING btree ("parent_id");
  CREATE INDEX "apps_rels_path_idx" ON "apps_rels" USING btree ("path");
  CREATE INDEX "apps_rels_app_categories_id_idx" ON "apps_rels" USING btree ("app_categories_id");
  CREATE INDEX "apps_rels_apps_id_idx" ON "apps_rels" USING btree ("apps_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_app_categories_fk" FOREIGN KEY ("app_categories_id") REFERENCES "public"."app_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_apps_fk" FOREIGN KEY ("apps_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_app_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("app_categories_id");
  CREATE INDEX "payload_locked_documents_rels_apps_id_idx" ON "payload_locked_documents_rels" USING btree ("apps_id");`)

  for (const [index, category] of categories.entries()) {
    const names: Record<string, string> = {
      en: category.en,
      'zh-Hans': category.hans,
      'zh-Hant': toHant(category.hans),
      ja: category.ja,
      ko: category.ko,
    }
    const rows = sql.join(
      Object.entries(names).map(([locale, name]) => sql`(${locale}, ${name})`),
      sql`, `,
    )
    await db.execute(sql`
      WITH category AS (
        INSERT INTO "app_categories" ("slug", "order") VALUES (${category.slug}, ${index + 1}) RETURNING "id"
      )
      INSERT INTO "app_categories_locales" ("name", "_locale", "_parent_id")
      SELECT v.name, v.locale::"_locales", category.id FROM category, (VALUES ${rows}) AS v(locale, name)`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "app_categories_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps_faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "app_categories" CASCADE;
  DROP TABLE "app_categories_locales" CASCADE;
  DROP TABLE "apps_platforms" CASCADE;
  DROP TABLE "apps_features" CASCADE;
  DROP TABLE "apps_faqs" CASCADE;
  DROP TABLE "apps" CASCADE;
  DROP TABLE "apps_locales" CASCADE;
  DROP TABLE "apps_texts" CASCADE;
  DROP TABLE "apps_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_app_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_apps_fk";
  
  DROP INDEX "payload_locked_documents_rels_app_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_apps_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "app_categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "apps_id";
  DROP TYPE "public"."enum_apps_platforms";
  DROP TYPE "public"."enum_apps_status";
  DROP TYPE "public"."enum_apps_pricing";`)
}
