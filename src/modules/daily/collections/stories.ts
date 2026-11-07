import type { CollectionBeforeChangeHook, CollectionConfig, FieldHook, TextFieldSingleValidation } from "payload";

import type { Story } from "@/payload-types";

import { syncHantFromHans } from "@/lib/i18n/hant-sync";
import { readerAccess } from "@/lib/reader-access"

import { storyCategories } from "../categories";
import { entityKey, entityKinds, type EntityKind } from "../entities";
import { parseVideo, storyMediaKinds, type StoryMediaKind } from "../media";
import { importEndpoint } from "../import/endpoint";
import { followPublishing, leaveOnDelete } from "../poster/hooks";
import { importanceOf, spreadIndex } from "../heat/importance";
import { peakOf } from "../heat/rules";
import { stampPublishing } from "../publish-time";
import { reviewEndpoints } from "../review/endpoints";
import { maxStoryTags, storyTags, tagLabels } from "../tags";
import {
  heatTrends,
  sourceRoles,
  storyStatuses,
  type HeatTrend,
  type SourceRole,
  type StoryStatus,
} from "../story-fields";

export {
  heatTrends,
  sourceRoles,
  storyStatuses,
  type HeatTrend,
  type SourceRole,
  type StoryStatus,
} from "../story-fields";

const mediaKindLabels: Record<StoryMediaKind, { en: string; zh: string }> = {
  none: { en: "None", zh: "无" },
  image: { en: "Image", zh: "图片" },
  video: { en: "Video", zh: "视频" },
};

/** A video story needs a YouTube, Vimeo or .mp4 / .webm address (docs/specs/daily.md「配图与视频」). */
const validateVideoUrl: TextFieldSingleValidation = (
  value,
  { siblingData, req },
) => {
  if ((siblingData as { kind?: string } | undefined)?.kind !== "video")
    return true;
  if (parseVideo(value)) return true;
  return req?.i18n?.language === "en"
    ? "Paste a YouTube or Vimeo link, or the address of an .mp4 or .webm file."
    : "请贴 YouTube 或 Vimeo 的链接，或者 .mp4、.webm 视频文件的地址。";
};

const idOf = (image: unknown): number | null =>
  image && typeof image === "object"
    ? Number((image as { id: unknown }).id)
    : typeof image === "number"
      ? image
      : null;

/**
 * Whether the picture was drawn by a model (docs/specs/daily.md「AI 配图」). Only the illustrate
 * job sets it; it turns off by itself when the picture is replaced or the media taken off, so a
 * real photo is never labelled as AI-drawn.
 */
const keepGenerated: FieldHook = ({ value, siblingData, originalDoc, context }) => {
  if (context?.illustrated) return true;
  const sibling = (siblingData ?? {}) as { kind?: string; image?: unknown };
  const before = (originalDoc as { media?: { kind?: string; image?: unknown; generated?: boolean | null } } | undefined)?.media;
  // An update that leaves the media alone carries none of these keys: fall back to what is stored.
  const kind = "kind" in sibling ? sibling.kind : before?.kind;
  const image = "image" in sibling ? sibling.image : before?.image;
  if (kind !== "image" || !image) return false;
  if (idOf(image) !== idOf(before?.image)) return false;
  return typeof value === "boolean" ? value : Boolean(before?.generated);
};

const entityKindLabels: Record<EntityKind, { en: string; zh: string }> = {
  company: { en: "Company", zh: "公司" },
  product: { en: "Product", zh: "产品" },
};

/** An editor who moves a story to another storyline (or off one) keeps it there: the job no longer touches it. */
const markStorylineByEditor: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!req.user || !data || !("storyline" in data)) return data;
  const id = (value: unknown) =>
    value && typeof value === "object" ? (value as { id: number }).id : (value ?? null);
  if (id(data.storyline) !== id(originalDoc?.storyline)) data.storylineByEditor = true;
  return data;
};

/**
 * Importance and the reach index follow the category, AI score, SOTA mark and peak heat on every
 * save, so a heat refresh, an import or an editor's change all keep them current (../heat/importance.ts).
 */
const stampSpread: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data;
  // An editor's tick or untick settles it: the catch-up job leaves the story alone.
  if (req.user && "sota" in data && Boolean(data.sota) !== Boolean(originalDoc?.sota)) data.sotaJudged = true;
  const pick = <K extends "category" | "score" | "sota" | "heatPeak" | "heat">(key: K) =>
    (key in data ? data[key] : originalDoc?.[key]) as Story[K];
  const importance = importanceOf({ category: pick("category"), score: pick("score"), sota: pick("sota") });
  data.importance = importance;
  // The reach is the peak heat, or the heat itself when the peak has not caught up yet (peakOf).
  data.spread = spreadIndex(importance, peakOf(pick("heatPeak"), pick("heat") ?? 0));
  return data;
};

const signedIn = ({ req: { user } }: { req: { user: unknown } }) =>
  Boolean(user);

const statusLabels: Record<StoryStatus, { en: string; zh: string }> = {
  pending: { en: "Pending review", zh: "待审" },
  published: { en: "Published", zh: "已发布" },
  rejected: { en: "Rejected", zh: "已拒绝" },
  merged: { en: "Merged into another story", zh: "已并入" },
  withdrawn: { en: "Withdrawn", zh: "已撤回" },
};

const categoryLabels = {
  llm: { en: "AI models", zh: "大模型" },
  tools: { en: "AI tools", zh: "AI工具" },
  aigc: { en: "Generative media", zh: "AIGC" },
  open: { en: "Open source", zh: "开源" },
  industry: { en: "Industry", zh: "行业动态" },
  research: { en: "Research", zh: "AI科研" },
  robotics: { en: "Robotics", zh: "机器人" },
} as const;

const roleLabels: Record<SourceRole, { en: string; zh: string }> = {
  original: { en: "Original", zh: "原文" },
  report: { en: "Report", zh: "报道" },
  discussion: { en: "Discussion", zh: "讨论" },
};

const trendLabels: Record<HeatTrend, { en: string; zh: string }> = {
  rising: { en: "Rising", zh: "上升" },
  new: { en: "New", zh: "新" },
};

const readOnly = { readOnly: true, position: "sidebar" } as const;

/** Localized text fields; zh-Hant is converted from zh-Hans on every zh-Hans save. */
const hantFields = ["title", "summary", "body", "tryIt"] as const;

/**
 * A written story (docs/specs/daily.md, `stories`). The writing job creates one per queued
 * report with title, summary and try-it in zh-Hans, en, ja and ko; zh-Hant is converted from
 * zh-Hans by the shared hook (AGENTS.md rule 4), so an editor's zh-Hans correction updates it
 * too. Review (the「审核队列」screen at /admin/collections/stories/review, backed by
 * `src/modules/daily/review/`) moves `status`, rewrites the other languages when the simplified
 * Chinese changed, sets the times and refreshes the site's cache. A story going on the site by
 * any path gets its approval time and, when it has none, a publish time from its sources
 * (../publish-time.ts). The day's poster follows a story going on or off the site (../poster/hooks.ts).
 * Stories from the editors' pipeline come in through POST /api/stories/import (../import/).
 */
export const Stories: CollectionConfig = {
  slug: "stories",
  labels: {
    singular: { en: "Story", zh: "新闻" },
    plural: { en: "Stories", zh: "新闻" },
  },
  hooks: {
    beforeChange: [stampPublishing, markStorylineByEditor, stampSpread],
    afterChange: [syncHantFromHans(hantFields), followPublishing],
    afterDelete: [leaveOnDelete],
  },
  endpoints: [...reviewEndpoints, importEndpoint],
  admin: {
    useAsTitle: "title",
    group: { en: "Daily", zh: "日报" },
    defaultColumns: [
      "title",
      "category",
      "status",
      "score",
      "publishedAt",
      "review",
    ],
    components: {
      beforeListTable: ["/modules/daily/admin/review/links#ReviewQueueButton"],
      views: {
        // The review screen (「IFAI 日报审核后台」board): queue on the left, one story in the middle.
        review: {
          Component: "/modules/daily/admin/review/view#ReviewQueueView",
          path: "/review",
          exact: true,
        },
      },
    },
  },
  access: {
    // Readers see published stories; everything else is for the back office.
    read: readerAccess({ status: { equals: "published" } }),
    create: signedIn,
    update: signedIn,
    delete: signedIn,
  },
  fields: [
    {
      name: "review",
      type: "ui",
      label: { en: "Review", zh: "审核" },
      admin: {
        components: {
          Cell: "/modules/daily/admin/review/links#ReviewCell",
          Field: "/modules/daily/admin/review/links#ReviewField",
        },
      },
    },
    {
      name: "title",
      type: "text",
      required: true,
      localized: true,
      label: { en: "Title", zh: "标题" },
    },
    {
      name: "summary",
      type: "textarea",
      required: true,
      localized: true,
      label: { en: "Summary", zh: "摘要" },
    },
    {
      name: "body",
      type: "textarea",
      localized: true,
      label: { en: "Body", zh: "正文" },
      admin: {
        rows: 16,
        description: {
          en: "The full story on its page, written from several sources. Leave a blank line between paragraphs; a line starting with \"## \" is a subheading.",
          zh: "详情页上的正文，综合几个来源自己写。段落之间空一行；以「## 」开头的一行是小标题。",
        },
      },
    },
    {
      name: "tryIt",
      type: "textarea",
      localized: true,
      label: { en: "Try it", zh: "试一试" },
      admin: {
        description: {
          en: "Optional; shown at the end of the item.",
          zh: "选填，显示在条目末尾。",
        },
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "slug",
          type: "text",
          required: true,
          unique: true,
          index: true,
          label: { en: "Slug", zh: "网址 slug" },
          admin: {
            description: {
              en: "English, shared by all languages.",
              zh: "英文，五种语言共用。",
            },
          },
        },
        {
          name: "category",
          type: "select",
          required: true,
          label: { en: "Category", zh: "分类" },
          options: storyCategories.map((value) => ({
            value,
            label: categoryLabels[value],
          })),
        },
        {
          name: "status",
          type: "select",
          required: true,
          defaultValue: "pending",
          label: { en: "Status", zh: "状态" },
          options: storyStatuses.map((value) => ({
            value,
            label: statusLabels[value],
          })),
        },
      ],
    },
    {
      name: "sources",
      type: "array",
      label: { en: "Sources", zh: "来源" },
      labels: {
        singular: { en: "Source", zh: "来源" },
        plural: { en: "Sources", zh: "来源" },
      },
      admin: { description: { en: "The original first.", zh: "原文在前。" } },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              label: { en: "Publisher", zh: "发布方" },
            },
            {
              name: "role",
              type: "select",
              required: true,
              defaultValue: "report",
              label: { en: "Role", zh: "角色" },
              options: sourceRoles.map((value) => ({
                value,
                label: roleLabels[value],
              })),
            },
          ],
        },
        {
          name: "url",
          type: "text",
          required: true,
          label: { en: "URL", zh: "网址" },
        },
        {
          name: "publishedAt",
          type: "date",
          label: { en: "Published", zh: "发布时间" },
          admin: { date: { pickerAppearance: "dayAndTime" } },
        },
      ],
    },
    {
      name: "tags",
      type: "select",
      hasMany: true,
      label: { en: "Industry tags", zh: "行业标签" },
      options: storyTags.map((value) => ({ value, label: tagLabels[value] })),
      validate: (value: unknown) =>
        !Array.isArray(value) || value.length <= maxStoryTags
          ? true
          : `At most ${maxStoryTags} / 最多 ${maxStoryTags} 个`,
      admin: {
        description: {
          en: "Up to 3. The story page links each to its list.",
          zh: "最多 3 个，详情页点进去是这个标签下的新闻。",
        },
      },
    },
    {
      name: "entities",
      type: "array",
      label: { en: "Companies and products", zh: "涉及的公司与产品" },
      labels: {
        singular: { en: "Company or product", zh: "公司或产品" },
        plural: { en: "Companies and products", zh: "公司与产品" },
      },
      admin: {
        description: {
          en: "What the story is about. Each links to its company or product page, which lists every story about it.",
          zh: "这条新闻讲的公司和产品。每个都链到它的话题页，列出提到它的所有新闻。",
        },
      },
      hooks: {
        // The key is derived from the name, so an edited name keeps its topic in step.
        beforeChange: [
          ({ value }) =>
            Array.isArray(value)
              ? value.map((row: { name?: string }) => ({
                  ...row,
                  key: entityKey(row.name ?? ""),
                }))
              : value,
        ],
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              label: { en: "Name", zh: "名称" },
            },
            {
              name: "kind",
              type: "select",
              required: true,
              defaultValue: "product",
              label: { en: "Kind", zh: "类型" },
              options: entityKinds.map((value) => ({
                value,
                label: entityKindLabels[value],
              })),
            },
          ],
        },
        {
          name: "key",
          type: "text",
          index: true,
          label: { en: "Key", zh: "比较用的名字" },
          admin: { hidden: true },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "storyline",
          type: "relationship",
          relationTo: "storylines",
          index: true,
          label: { en: "Storyline", zh: "持续事件" },
          filterOptions: { status: { not_equals: "merged" } },
          admin: {
            description: {
              en: "The ongoing storyline it is a step of; its stories are listed together on the story page. Set automatically after publishing; once changed here, it stays as you set it.",
              zh: "它是哪个持续事件里的一步，同一个持续事件的新闻在详情页串在一起。发布后自动挂上；在这里改过之后就按你改的。",
            },
          },
        },
        {
          name: "storylineByEditor",
          type: "checkbox",
          label: { en: "Storyline set by an editor", zh: "持续事件由站长定" },
          admin: {
            description: {
              en: "The assignment job leaves this story alone.",
              zh: "自动挂的任务不再改这条。",
            },
          },
        },
      ],
    },
    {
      name: "media",
      type: "group",
      label: { en: "Picture or video", zh: "配图" },
      admin: {
        description: {
          en: "Taken from the original article when the story is written. A video shows its cover with a play button and plays in a dialog.",
          zh: "写好新闻时从原文自动取。视频显示封面和播放按钮，点开在弹窗里播放。",
        },
      },
      fields: [
        {
          name: "kind",
          type: "select",
          defaultValue: "none",
          label: { en: "Type", zh: "类型" },
          options: storyMediaKinds.map((value) => ({
            value,
            label: mediaKindLabels[value],
          })),
        },
        {
          name: "videoUrl",
          type: "text",
          label: { en: "Video address", zh: "视频地址" },
          validate: validateVideoUrl,
          admin: {
            condition: (_, sibling) => sibling?.kind === "video",
            description: {
              en: "YouTube, Vimeo, or an .mp4 / .webm file.",
              zh: "YouTube、Vimeo，或者 .mp4、.webm 文件。",
            },
          },
        },
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          label: { en: "Image", zh: "图片" },
          admin: {
            condition: (_, sibling) =>
              sibling?.kind === "image" || sibling?.kind === "video",
            description: {
              en: "For a video, its cover. Optional for videos.",
              zh: "视频的话是封面，可以不填。",
            },
          },
        },
        {
          name: "credit",
          type: "text",
          label: { en: "Credit", zh: "图片来源" },
          admin: {
            condition: (_, sibling) =>
              sibling?.kind === "image" || sibling?.kind === "video",
            description: {
              en: 'Shown under the picture on the story page: "Image: …".',
              zh: "详情页图下显示「图：…」。",
            },
          },
        },
        {
          name: "generated",
          type: "checkbox",
          defaultValue: false,
          label: { en: "Drawn by AI", zh: "AI 生成" },
          hooks: { beforeChange: [keepGenerated] },
          admin: {
            condition: (_, sibling) => sibling?.kind === "image",
            description: {
              en: 'Drawn by a model because the story had no picture. The story page says "AI-generated image" instead of the credit. Turns off when the picture is replaced.',
              zh: "新闻没有配图时由模型画的。详情页图下写「AI 生成配图」，不写来源。换了图会自动取消。",
            },
          },
        },
      ],
    },
    {
      name: "eventId",
      type: "number",
      required: true,
      label: { en: "Event", zh: "事件" },
      admin: readOnly,
    },
    {
      name: "representativeItemId",
      type: "number",
      required: true,
      unique: true,
      label: { en: "Report (raw_items id)", zh: "来源报道（raw_items id）" },
      admin: readOnly,
    },
    {
      name: "score",
      type: "number",
      label: { en: "AI score", zh: "AI 评分" },
      admin: readOnly,
    },
    {
      name: "heat",
      type: "number",
      label: { en: "Heat", zh: "热度" },
      admin: {
        ...readOnly,
        description: {
          en: "0–100, the event's heat; refreshed every hour.",
          zh: "0–100，所属事件的热度，每小时更新。",
        },
      },
    },
    {
      name: "heatPeak",
      type: "number",
      label: { en: "Reach", zh: "传播度" },
      admin: {
        ...readOnly,
        description: {
          en: "The highest heat the event has reached; never drops.",
          zh: "所属事件到过的最高热度，只升不降。",
        },
      },
    },
    {
      name: "sota",
      type: "checkbox",
      defaultValue: false,
      label: { en: "Landmark (SOTA model or breakthrough)", zh: "里程碑（SOTA 模型或重大突破）" },
      admin: {
        position: "sidebar",
        description: {
          en: "A new model at the top of its class, or research that changes a field (AlphaFold, AI settling open problems in mathematics). Its importance is the full 100.",
          zh: "发布了同类里排第一的新模型，或者改变一个领域的科研突破（AlphaFold、AI 解决公认的数学难题）。重要性按满分 100 算。",
        },
      },
    },
    {
      // Whether the SOTA mark has been decided: by the structuring step, an editor, the import, or the catch-up job (../heat/sota.ts).
      name: "sotaJudged",
      type: "checkbox",
      defaultValue: false,
      admin: { hidden: true },
    },
    {
      name: "importance",
      type: "number",
      label: { en: "Importance", zh: "重要性" },
      admin: {
        ...readOnly,
        description: {
          en: "0–100: 100 for a landmark, else by category and AI score.",
          zh: "0–100：里程碑 100，其他按分类和 AI 评分。",
        },
      },
    },
    {
      name: "spread",
      type: "number",
      index: true,
      label: { en: "Reach index", zh: "传播指数" },
      admin: {
        ...readOnly,
        description: {
          en: "Importance and reach together; the pages show it.",
          zh: "重要性和传播度合起来，前台显示的就是它。",
        },
      },
    },
    {
      name: "heatTrend",
      type: "select",
      label: { en: "Heat trend", zh: "热度走势" },
      options: heatTrends.map((value) => ({
        value,
        label: trendLabels[value],
      })),
      admin: {
        ...readOnly,
        description: {
          en: "Compared with 6 hours earlier.",
          zh: "和 6 小时前比较。",
        },
      },
    },
    {
      // Addresses of the event's reports and discussion threads already offered to the source
      // list (../heat/sources.ts), so one the editor removed is not added back.
      name: "sourcesSeen",
      type: "json",
      label: { en: "Sources already considered", zh: "已同步过的来源" },
      admin: { hidden: true },
    },
    {
      name: "flags",
      type: "json",
      label: { en: "Flags", zh: "标记" },
      admin: {
        ...readOnly,
        description: {
          en: "promotional, tutorial, score_gap",
          zh: "疑似推广、教程类、两次评分差距大",
        },
      },
    },
    {
      name: "verification",
      type: "json",
      label: { en: "Source check", zh: "原文核对" },
      admin: {
        ...readOnly,
        description: {
          en: "Names and numbers in the text that were not found in the reports.",
          zh: "标题、摘要、试一试里在原文中找不到的名字和数字。",
        },
      },
    },
    {
      name: "localeStatus",
      type: "json",
      label: { en: "Languages", zh: "各语言状态" },
      admin: {
        ...readOnly,
        description: {
          en: "Which languages were written, and when.",
          zh: "哪些语言已写好，什么时候写的。",
        },
      },
    },
    {
      name: "promptVersion",
      type: "text",
      label: { en: "Prompt version", zh: "提示词版本" },
      admin: readOnly,
    },
    {
      name: "publishedAt",
      type: "date",
      label: { en: "Published at", zh: "发布时间" },
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
        description: {
          en: "The news source's time: the site shows it and sorts by it. Left empty, approving fills in the original source's time (else the approval's).",
          zh: "新闻源的发布时间，页面上显示、排序都按它。空着时审核通过会填上原文的发布时间，原文没有时间才用审核通过的时刻。",
        },
      },
    },
    {
      name: "approvedAt",
      type: "date",
      label: { en: "Approved at", zh: "审核通过" },
      admin: {
        ...readOnly,
        date: { pickerAppearance: "dayAndTime" },
        description: {
          en: "When it first went on the site. The morning email picks by it.",
          zh: "第一次上线的时刻，晨报邮件按它选稿。",
        },
      },
    },
    {
      name: "correctedAt",
      type: "date",
      label: { en: "Corrected at", zh: "更正时间" },
      admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "laterAt",
      type: "date",
      label: { en: "Set aside at", zh: "稍后再看" },
      admin: {
        ...readOnly,
        date: { pickerAppearance: "dayAndTime" },
        description: {
          en: "Moves the story to the end of the queue.",
          zh: "设了就排到队列末尾。",
        },
      },
    },
    {
      name: "mergedInto",
      type: "number",
      label: { en: "Merged into (story id)", zh: "并入的新闻（id）" },
      admin: readOnly,
    },
    {
      name: "keptApartFrom",
      type: "number",
      label: {
        en: "Not the same as (story id)",
        zh: "不是同一件事（对方 id）",
      },
      admin: {
        ...readOnly,
        description: {
          en: "The editor said it is not the same happening as this published story.",
          zh: "审核时确认过和这条已发布的新闻不是同一件事。",
        },
      },
    },
  ],
};
