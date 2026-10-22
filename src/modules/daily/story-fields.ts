/** Enumerations of the `stories` collection, kept apart so review code can import them without loading the collection. */

/** 待审 / 已发布 / 已拒绝 / 已并入 / 已撤回 (docs/specs/daily.md「数据」). */
export const storyStatuses = ['pending', 'published', 'rejected', 'merged', 'withdrawn'] as const
export type StoryStatus = (typeof storyStatuses)[number]

/** The original announcement comes first; reports and discussion threads follow. */
export const sourceRoles = ['original', 'report', 'discussion'] as const
export type SourceRole = (typeof sourceRoles)[number]
