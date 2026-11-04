import type { CollectionAfterChangeHook, CollectionConfig, Where } from "payload";

import { syncHantFromHans } from "@/lib/i18n/hant-sync";

import { refreshDailyCache } from "../review/cache";

import { storylineStatuses, type StorylineStatus } from "../storylines/rules";

const signedIn = ({ req: { user } }: { req: { user: unknown } }) =>
  Boolean(user);

const statusLabels: Record<StorylineStatus, { en: string; zh: string }> = {
  active: { en: "Ongoing", zh: "进行中" },
  ended: { en: "Ended", zh: "已结束" },
  merged: { en: "Merged into another", zh: "已合并" },
};

/** Localized text fields; zh-Hant is converted from zh-Hans on every zh-Hans save. */
const hantFields = ["name", "summary"] as const;

/** A renamed, ended or merged storyline shows on the story pages at once. */
const refreshPages: CollectionAfterChangeHook = async ({ doc }) => {
  await refreshDailyCache();
  return doc;
};

/** Skips the merge hook while it moves the stories itself. */
const movingContext = "storylineMerge";

/**
 * Merging (the editor picks「合并到」): the storyline's stories move to the other one, marked as
 * the editor's, and this one is set to merged so the assignment job never offers it again.
 */
const mergeStories: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  context,
}) => {
  if (context[movingContext]) return doc;
  const target =
    typeof doc.mergedInto === "object"
      ? doc.mergedInto?.id
      : (doc.mergedInto as number | null | undefined);
  const before =
    typeof previousDoc?.mergedInto === "object"
      ? previousDoc?.mergedInto?.id
      : (previousDoc?.mergedInto as number | null | undefined);
  if (!target || target === before || target === doc.id) return doc;
  await req.payload.update({
    collection: "stories",
    where: { storyline: { equals: doc.id } },
    data: { storyline: target, storylineByEditor: true },
    depth: 0,
    req,
    context: { [movingContext]: true },
  });
  if (doc.status !== "merged") {
    await req.payload.update({
      collection: "storylines",
      id: doc.id,
      data: { status: "merged" },
      depth: 0,
      req,
      context: { [movingContext]: true },
    });
  }
  return doc;
};

/**
 * An ongoing storyline (docs/specs/daily.md「持续事件」): a story that runs over weeks or
 * months, such as a lawsuit with its hearings and settlement. The assignment job
 * (../storylines/) puts published stories on one, opens one when two stories start it, or
 * leaves a story without; the story page's「话题追踪」lists its stories. The editor renames,
 * ends or merges them here, and moves a story on its own edit page.
 */
export const Storylines: CollectionConfig = {
  slug: "storylines",
  labels: {
    singular: { en: "Storyline", zh: "持续事件" },
    plural: { en: "Storylines", zh: "持续事件" },
  },
  hooks: {
    afterChange: [syncHantFromHans(hantFields), mergeStories, refreshPages],
  },
  admin: {
    useAsTitle: "name",
    group: { en: "Daily", zh: "日报" },
    defaultColumns: ["name", "status", "updatedAt"],
    description: {
      en: "Stories that belong to one ongoing storyline are listed together on the story page (「话题追踪」). Assigned automatically after publishing; correct them here or on a story's edit page.",
      zh: "同一个持续事件的新闻在详情页「话题追踪」里串在一起。新闻发布后自动挂上；这里可以改名、标记已结束、合并，单条新闻在它的编辑页里改。",
    },
  },
  access: {
    read: () => true,
    create: signedIn,
    update: signedIn,
    delete: signedIn,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      localized: true,
      label: { en: "Name", zh: "名称" },
      admin: {
        description: {
          en: "Short, names the storyline: \"Musk v. OpenAI\".",
          zh: "简短，说清楚是哪件事：「马斯克起诉 OpenAI」。",
        },
      },
    },
    {
      name: "summary",
      type: "textarea",
      localized: true,
      label: { en: "What it is about", zh: "一句话说明" },
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
        },
        {
          name: "status",
          type: "select",
          required: true,
          defaultValue: "active",
          label: { en: "Status", zh: "状态" },
          options: storylineStatuses.map((value) => ({
            value,
            label: statusLabels[value],
          })),
          admin: {
            description: {
              en: "Only ongoing storylines take new stories.",
              zh: "只有进行中的持续事件会挂上新的新闻。",
            },
          },
        },
      ],
    },
    {
      name: "mergedInto",
      type: "relationship",
      relationTo: "storylines",
      label: { en: "Merge into", zh: "合并到" },
      filterOptions: ({ id }): Where => ({
        and: [{ id: { not_equals: id } }, { status: { not_equals: "merged" } }] as Where[],
      }),
      admin: {
        position: "sidebar",
        description: {
          en: "Saving moves every story of this storyline there.",
          zh: "保存后，这个持续事件的新闻都挪过去。",
        },
      },
    },
  ],
};
