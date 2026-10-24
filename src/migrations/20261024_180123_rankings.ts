import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { toHant } from '../lib/i18n/hant'

/**
 * The first two arenas of docs/specs/rankings.md (rule 3), in display order and published: the
 * pages stay hidden until NEXT_PUBLIC_SITE_PHASE is 3. zh-Hant is converted from zh-Hans with
 * OpenCC. Kept inline so this migration stays frozen even if the collection changes later.
 */
const arenas = [
  {
    slug: 'text',
    name: { en: 'Text', hans: '文本', ja: 'テキスト', ko: '텍스트' },
    intro: {
      en: 'Writing, explaining, advice and everyday questions.',
      hans: '写作、解释、建议和日常问题。',
      ja: '文章作成、説明、アドバイス、日常の質問。',
      ko: '글쓰기, 설명, 조언, 일상적인 질문.',
    },
  },
  {
    slug: 'coding',
    name: { en: 'Coding', hans: '编程', ja: 'コーディング', ko: '코딩' },
    intro: {
      en: 'Writing, fixing and explaining code.',
      hans: '写代码、改代码、解释代码。',
      ja: 'コードを書く、直す、説明する。',
      ko: '코드 작성, 수정, 설명.',
    },
  },
]

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_arenas_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_arena_models_weights" AS ENUM('open', 'closed');
  CREATE TYPE "public"."enum_arena_models_region" AS ENUM('us', 'cn', 'eu', 'other');
  CREATE TYPE "public"."enum_arena_models_status" AS ENUM('draft', 'active', 'retired');
  CREATE TYPE "public"."enum_arena_prompts_lang" AS ENUM('en', 'zh-Hans', 'ja', 'ko');
  CREATE TYPE "public"."enum_arena_prompts_status" AS ENUM('active', 'retired');
  CREATE TYPE "public"."enum_arena_answers_lang" AS ENUM('en', 'zh-Hans', 'ja', 'ko');
  CREATE TYPE "public"."enum_arena_answers_status" AS ENUM('pending', 'done', 'failed');
  CREATE TABLE "arena_battles" (
  	"id" text PRIMARY KEY NOT NULL,
  	"arena_id" integer NOT NULL,
  	"prompt_id" integer NOT NULL,
  	"model_a_id" integer NOT NULL,
  	"model_b_id" integer NOT NULL,
  	"answer_a_id" integer NOT NULL,
  	"answer_b_id" integer NOT NULL,
  	"user_id" text,
  	"page_locale" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"voted_at" timestamp with time zone,
  	"outcome" text,
  	"counted" boolean DEFAULT false NOT NULL
  );
  
  CREATE TABLE "arena_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"arena_id" integer NOT NULL,
  	"week" date NOT NULL,
  	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"votes" integer NOT NULL,
  	"method" text NOT NULL,
  	"checksum" text NOT NULL
  );
  
  CREATE TABLE "arena_snapshot_rows" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"snapshot_id" integer NOT NULL,
  	"model_id" integer NOT NULL,
  	"rank" integer,
  	"provisional" boolean NOT NULL,
  	"score" double precision NOT NULL,
  	"lower" double precision NOT NULL,
  	"upper" double precision NOT NULL,
  	"votes" integer NOT NULL,
  	"wins" integer NOT NULL,
  	"losses" integer NOT NULL,
  	"ties" integer NOT NULL,
  	"cost_usd" numeric(12, 6)
  );
  
  CREATE TABLE "arenas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"status" "enum_arenas_status" DEFAULT 'draft' NOT NULL,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "arenas_locales" (
  	"name" varchar NOT NULL,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "arena_models" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"openrouter_id" varchar NOT NULL,
  	"weights" "enum_arena_models_weights" NOT NULL,
  	"region" "enum_arena_models_region" NOT NULL,
  	"license" varchar,
  	"license_url" varchar,
  	"status" "enum_arena_models_status" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "arena_models_locales" (
  	"org" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "arena_models_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"arenas_id" integer
  );
  
  CREATE TABLE "arena_prompts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"arena_id" integer NOT NULL,
  	"lang" "enum_arena_prompts_lang" NOT NULL,
  	"status" "enum_arena_prompts_status" DEFAULT 'active' NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "arena_answers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hidden" boolean DEFAULT false,
  	"prompt_id" integer NOT NULL,
  	"model_id" integer NOT NULL,
  	"arena_id" integer NOT NULL,
  	"lang" "enum_arena_answers_lang" NOT NULL,
  	"status" "enum_arena_answers_status" DEFAULT 'pending' NOT NULL,
  	"text" varchar,
  	"cut_off" boolean DEFAULT false,
  	"names_itself" boolean DEFAULT false,
  	"error" varchar,
  	"cost_usd" numeric,
  	"input_tokens" numeric,
  	"output_tokens" numeric,
  	"attempts" numeric DEFAULT 0,
  	"generated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "arenas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "arena_models_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "arena_prompts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "arena_answers_id" integer;
  ALTER TABLE "arena_battles" ADD CONSTRAINT "arena_battles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "arena_snapshot_rows" ADD CONSTRAINT "arena_snapshot_rows_snapshot_id_arena_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."arena_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "arenas_locales" ADD CONSTRAINT "arenas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."arenas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "arena_models_locales" ADD CONSTRAINT "arena_models_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."arena_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "arena_models_rels" ADD CONSTRAINT "arena_models_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."arena_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "arena_models_rels" ADD CONSTRAINT "arena_models_rels_arenas_fk" FOREIGN KEY ("arenas_id") REFERENCES "public"."arenas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "arena_prompts" ADD CONSTRAINT "arena_prompts_arena_id_arenas_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arenas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "arena_answers" ADD CONSTRAINT "arena_answers_prompt_id_arena_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."arena_prompts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "arena_answers" ADD CONSTRAINT "arena_answers_model_id_arena_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."arena_models"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "arena_answers" ADD CONSTRAINT "arena_answers_arena_id_arenas_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arenas"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "arena_battles_arena_counted_idx" ON "arena_battles" USING btree ("arena_id","counted");
  CREATE INDEX "arena_battles_user_created_idx" ON "arena_battles" USING btree ("user_id","created_at");
  CREATE INDEX "arena_battles_created_idx" ON "arena_battles" USING btree ("created_at");
  CREATE UNIQUE INDEX "arena_snapshots_arena_week_idx" ON "arena_snapshots" USING btree ("arena_id","week");
  CREATE INDEX "arena_snapshot_rows_snapshot_idx" ON "arena_snapshot_rows" USING btree ("snapshot_id");
  CREATE INDEX "arena_snapshot_rows_model_idx" ON "arena_snapshot_rows" USING btree ("model_id");
  CREATE UNIQUE INDEX "arenas_slug_idx" ON "arenas" USING btree ("slug");
  CREATE INDEX "arenas_updated_at_idx" ON "arenas" USING btree ("updated_at");
  CREATE INDEX "arenas_created_at_idx" ON "arenas" USING btree ("created_at");
  CREATE UNIQUE INDEX "arenas_locales_locale_parent_id_unique" ON "arenas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "arenas_locales_parent_id_idx" ON "arenas_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "arena_models_openrouter_id_idx" ON "arena_models" USING btree ("openrouter_id");
  CREATE INDEX "arena_models_updated_at_idx" ON "arena_models" USING btree ("updated_at");
  CREATE INDEX "arena_models_created_at_idx" ON "arena_models" USING btree ("created_at");
  CREATE UNIQUE INDEX "arena_models_locales_locale_parent_id_unique" ON "arena_models_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "arena_models_locales_parent_id_idx" ON "arena_models_locales" USING btree ("_parent_id");
  CREATE INDEX "arena_models_rels_order_idx" ON "arena_models_rels" USING btree ("order");
  CREATE INDEX "arena_models_rels_parent_idx" ON "arena_models_rels" USING btree ("parent_id");
  CREATE INDEX "arena_models_rels_path_idx" ON "arena_models_rels" USING btree ("path");
  CREATE INDEX "arena_models_rels_arenas_id_idx" ON "arena_models_rels" USING btree ("arenas_id");
  CREATE INDEX "arena_prompts_arena_idx" ON "arena_prompts" USING btree ("arena_id");
  CREATE INDEX "arena_prompts_updated_at_idx" ON "arena_prompts" USING btree ("updated_at");
  CREATE INDEX "arena_prompts_created_at_idx" ON "arena_prompts" USING btree ("created_at");
  CREATE INDEX "arena_answers_prompt_idx" ON "arena_answers" USING btree ("prompt_id");
  CREATE INDEX "arena_answers_model_idx" ON "arena_answers" USING btree ("model_id");
  CREATE INDEX "arena_answers_arena_idx" ON "arena_answers" USING btree ("arena_id");
  CREATE INDEX "arena_answers_status_idx" ON "arena_answers" USING btree ("status");
  CREATE INDEX "arena_answers_updated_at_idx" ON "arena_answers" USING btree ("updated_at");
  CREATE INDEX "arena_answers_created_at_idx" ON "arena_answers" USING btree ("created_at");
  CREATE UNIQUE INDEX "prompt_model_idx" ON "arena_answers" USING btree ("prompt_id","model_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_arenas_fk" FOREIGN KEY ("arenas_id") REFERENCES "public"."arenas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_arena_models_fk" FOREIGN KEY ("arena_models_id") REFERENCES "public"."arena_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_arena_prompts_fk" FOREIGN KEY ("arena_prompts_id") REFERENCES "public"."arena_prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_arena_answers_fk" FOREIGN KEY ("arena_answers_id") REFERENCES "public"."arena_answers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_arenas_id_idx" ON "payload_locked_documents_rels" USING btree ("arenas_id");
  CREATE INDEX "payload_locked_documents_rels_arena_models_id_idx" ON "payload_locked_documents_rels" USING btree ("arena_models_id");
  CREATE INDEX "payload_locked_documents_rels_arena_prompts_id_idx" ON "payload_locked_documents_rels" USING btree ("arena_prompts_id");
  CREATE INDEX "payload_locked_documents_rels_arena_answers_id_idx" ON "payload_locked_documents_rels" USING btree ("arena_answers_id");`)

  for (const [index, arena] of arenas.entries()) {
    const texts = (['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const).map((locale) => {
      const pick = (text: { en: string; hans: string; ja: string; ko: string }) =>
        locale === 'zh-Hans' ? text.hans : locale === 'zh-Hant' ? toHant(text.hans) : text[locale]
      return sql`(${locale}, ${pick(arena.name)}, ${pick(arena.intro)})`
    })
    await db.execute(sql`
      WITH arena AS (
        INSERT INTO "arenas" ("slug", "status", "order") VALUES (${arena.slug}, 'published', ${index + 1}) RETURNING "id"
      )
      INSERT INTO "arenas_locales" ("name", "intro", "_locale", "_parent_id")
      SELECT v.name, v.intro, v.locale::"_locales", arena.id FROM arena, (VALUES ${sql.join(texts, sql`, `)}) AS v(locale, name, intro)`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "arena_battles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arena_snapshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arena_snapshot_rows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arenas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arenas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arena_models" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arena_models_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arena_models_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arena_prompts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "arena_answers" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "arena_battles" CASCADE;
  DROP TABLE "arena_snapshots" CASCADE;
  DROP TABLE "arena_snapshot_rows" CASCADE;
  DROP TABLE "arenas" CASCADE;
  DROP TABLE "arenas_locales" CASCADE;
  DROP TABLE "arena_models" CASCADE;
  DROP TABLE "arena_models_locales" CASCADE;
  DROP TABLE "arena_models_rels" CASCADE;
  DROP TABLE "arena_prompts" CASCADE;
  DROP TABLE "arena_answers" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_arenas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_arena_models_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_arena_prompts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_arena_answers_fk";
  
  DROP INDEX "payload_locked_documents_rels_arenas_id_idx";
  DROP INDEX "payload_locked_documents_rels_arena_models_id_idx";
  DROP INDEX "payload_locked_documents_rels_arena_prompts_id_idx";
  DROP INDEX "payload_locked_documents_rels_arena_answers_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "arenas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "arena_models_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "arena_prompts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "arena_answers_id";
  DROP TYPE "public"."enum_arenas_status";
  DROP TYPE "public"."enum_arena_models_weights";
  DROP TYPE "public"."enum_arena_models_region";
  DROP TYPE "public"."enum_arena_models_status";
  DROP TYPE "public"."enum_arena_prompts_lang";
  DROP TYPE "public"."enum_arena_prompts_status";
  DROP TYPE "public"."enum_arena_answers_lang";
  DROP TYPE "public"."enum_arena_answers_status";`)
}
