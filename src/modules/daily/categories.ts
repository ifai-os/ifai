/**
 * Story categories, in the order the pages show them (docs/specs/daily.md「分类与分类页」). Keys
 * match `categories.*` and `categoryAbout.*` in messages/*.json, and the category pages' art.
 */
export const storyCategories = ['llm', 'tools', 'aigc', 'open', 'industry', 'research', 'robotics'] as const
export type StoryCategory = (typeof storyCategories)[number]

/** What each category means, for the structuring prompt; the「日报分类底图」board's rules decide the close calls. */
export const categoryGuide: Record<StoryCategory, string> = {
  llm: 'a new or upgraded model that is not open-weight: releases, context length, pricing and API changes',
  tools: 'AI apps and tools: new products and features, pricing and availability changes',
  aigc: 'generating and editing images, video, audio, music and 3D',
  open: 'open-source or open-weight models (here rather than "llm"), datasets, frameworks and developer tools',
  industry: 'companies and the market: funding, acquisitions, partnerships, people, policy, regulation, lawsuits, compute deals',
  research: 'papers, benchmarks, new methods, and AI used in scientific research',
  robotics: 'humanoid robots, robot arms, embodied AI models, and self-driving cars',
}

/** The categories before 2026-10-24 that are now another one (migration daily_categories). */
const formerCategories: Record<string, StoryCategory> = { product: 'tools', design: 'aigc' }

/**
 * A category read back from stored JSON (a poster's frozen entries, a structuring result): a
 * former one as its new category, anything unknown as「行业动态」.
 */
export function storyCategoryOf(value: unknown): StoryCategory {
  if (typeof value !== 'string') return 'industry'
  if ((storyCategories as readonly string[]).includes(value)) return value as StoryCategory
  return formerCategories[value] ?? 'industry'
}
