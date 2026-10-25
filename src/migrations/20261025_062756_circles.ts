import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { toHant } from '../lib/i18n/hant'

/**
 * The first five circles of docs/specs/circles.md (the「IFAI 圈子」board), in display order, with
 * the tile tone the board gives each. zh-Hant is converted from zh-Hans with OpenCC, never typed
 * by hand. Kept inline so this migration stays frozen even if the collection changes later.
 */
const circles = [
  {
    slug: 'ai-art',
    tone: '3',
    en: ['AI Art', 'Images made with AI, with their styles and settings'],
    hans: ['AI 绘画', '用 AI 画的图，附上风格和提示词'],
    ja: ['AIイラスト', 'AIで描いた絵と、そのスタイルやパラメータ'],
    ko: ['AI 그림', 'AI로 그린 그림과 스타일, 설정'],
  },
  {
    slug: 'agent-workflows',
    tone: '1',
    en: ['Agent Workflows', 'How you put agents to work, step by step'],
    hans: ['Agent 工作流', '把 Agent 用进日常工作的流程和经验'],
    ja: ['エージェント活用', 'エージェントを日々の仕事に使う流れとコツ'],
    ko: ['에이전트 워크플로', '에이전트를 일상 업무에 쓰는 흐름과 경험'],
  },
  {
    slug: 'prompts',
    tone: '2',
    en: ['Prompts', 'Prompts that work, and tricks for writing them'],
    hans: ['提示词', '好用的提示词和写法技巧'],
    ja: ['プロンプト', '使えるプロンプトと書き方のコツ'],
    ko: ['프롬프트', '잘 통하는 프롬프트와 작성 요령'],
  },
  {
    slug: 'desks-and-gear',
    tone: '4',
    en: ['Desks & Gear', 'The desks and gear you work with AI on'],
    hans: ['桌面与装备', '和 AI 一起干活的桌面和设备'],
    ja: ['デスクと機材', 'AIと仕事するデスクと機材'],
    ko: ['책상과 장비', 'AI와 함께 일하는 책상과 장비'],
  },
  {
    slug: 'jobs-and-careers',
    tone: '6',
    en: ['Jobs & Careers', 'Finding work and changing careers in the age of AI'],
    hans: ['求职与转岗', 'AI 时代找工作、换方向的经验'],
    ja: ['就職・転職', 'AI時代の就職とキャリアチェンジ'],
    ko: ['구직·이직', 'AI 시대의 구직과 커리어 전환'],
  },
] as const

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_circles_tone" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TABLE "circle_members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"circle_id" integer NOT NULL,
  	"user_id" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "circle_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"circle_id" integer NOT NULL,
  	"user_id" text NOT NULL,
  	"body" text NOT NULL,
  	"lang" text NOT NULL,
  	"status" text DEFAULT 'shown' NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "circle_post_reactions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"post_id" integer NOT NULL,
  	"user_id" text NOT NULL,
  	"reaction" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "circle_post_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"post_id" integer NOT NULL,
  	"reporter" text NOT NULL,
  	"reason" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"resolved_at" timestamp with time zone
  );
  
  CREATE TABLE "circles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"tone" "enum_circles_tone" DEFAULT '3' NOT NULL,
  	"order" numeric DEFAULT 0,
  	"shown" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "circles_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "circles_id" integer;
  ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_posts" ADD CONSTRAINT "circle_posts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_post_reactions" ADD CONSTRAINT "circle_post_reactions_post_id_circle_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."circle_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_post_reactions" ADD CONSTRAINT "circle_post_reactions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circle_post_reports" ADD CONSTRAINT "circle_post_reports_post_id_circle_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."circle_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "circles_locales" ADD CONSTRAINT "circles_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "circle_members_circle_user_idx" ON "circle_members" USING btree ("circle_id","user_id");
  CREATE INDEX "circle_members_user_idx" ON "circle_members" USING btree ("user_id");
  CREATE INDEX "circle_posts_created_idx" ON "circle_posts" USING btree ("created_at");
  CREATE INDEX "circle_posts_circle_idx" ON "circle_posts" USING btree ("circle_id","id");
  CREATE INDEX "circle_posts_user_created_idx" ON "circle_posts" USING btree ("user_id","created_at");
  CREATE UNIQUE INDEX "circle_post_reactions_post_user_reaction_idx" ON "circle_post_reactions" USING btree ("post_id","user_id","reaction");
  CREATE INDEX "circle_post_reactions_user_idx" ON "circle_post_reactions" USING btree ("user_id");
  CREATE UNIQUE INDEX "circle_post_reports_post_reporter_idx" ON "circle_post_reports" USING btree ("post_id","reporter");
  CREATE INDEX "circle_post_reports_resolved_idx" ON "circle_post_reports" USING btree ("resolved_at");
  CREATE UNIQUE INDEX "circles_slug_idx" ON "circles" USING btree ("slug");
  CREATE INDEX "circles_updated_at_idx" ON "circles" USING btree ("updated_at");
  CREATE INDEX "circles_created_at_idx" ON "circles" USING btree ("created_at");
  CREATE UNIQUE INDEX "circles_locales_locale_parent_id_unique" ON "circles_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "circles_locales_parent_id_idx" ON "circles_locales" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_circles_fk" FOREIGN KEY ("circles_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_circles_id_idx" ON "payload_locked_documents_rels" USING btree ("circles_id");`)

  for (const [index, circle] of circles.entries()) {
    const texts: Record<string, readonly [string, string]> = {
      en: circle.en,
      'zh-Hans': circle.hans,
      'zh-Hant': [toHant(circle.hans[0]), toHant(circle.hans[1])],
      ja: circle.ja,
      ko: circle.ko,
    }
    const rows = sql.join(
      Object.entries(texts).map(([locale, [name, description]]) => sql`(${locale}, ${name}, ${description})`),
      sql`, `,
    )
    await db.execute(sql`
      WITH circle AS (
        INSERT INTO "circles" ("slug", "tone", "order") VALUES (${circle.slug}, ${circle.tone}, ${index + 1}) RETURNING "id"
      )
      INSERT INTO "circles_locales" ("name", "description", "_locale", "_parent_id")
      SELECT v.name, v.description, v.locale::"_locales", circle.id FROM circle, (VALUES ${rows}) AS v(locale, name, description)`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "circle_members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "circle_posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "circle_post_reactions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "circle_post_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "circles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "circles_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "circle_members" CASCADE;
  DROP TABLE "circle_posts" CASCADE;
  DROP TABLE "circle_post_reactions" CASCADE;
  DROP TABLE "circle_post_reports" CASCADE;
  DROP TABLE "circles" CASCADE;
  DROP TABLE "circles_locales" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_circles_fk";
  
  DROP INDEX "payload_locked_documents_rels_circles_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "circles_id";
  DROP TYPE "public"."enum_circles_tone";`)
}
