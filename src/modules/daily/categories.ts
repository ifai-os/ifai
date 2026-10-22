/**
 * Story categories, as on the daily list and the review dashboard boards. Keys match
 * `categories.*` in messages/*.json where the UI shows them.
 */
export const storyCategories = ['product', 'industry', 'open', 'design', 'research'] as const
export type StoryCategory = (typeof storyCategories)[number]

/** What each category means, for the structuring prompt. */
export const categoryGuide: Record<StoryCategory, string> = {
  product: 'a new or changed AI product, feature, model or service from its maker; pricing, availability, platform launches',
  industry: 'companies and the market: funding, acquisitions, partnerships, people, policy, regulation, lawsuits, infrastructure deals',
  open: 'open-weight or open-source models, datasets, frameworks and developer tools',
  design: 'image, video, audio, music and design generation and editing',
  research: 'papers, benchmarks, methods, scientific results and technical reports',
}
