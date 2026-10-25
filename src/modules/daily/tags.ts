/**
 * Industry tags of a story (docs/specs/daily.md「详情页：行业标签…」). A story has one category
 * but up to three tags; the structuring step picks them from this fixed list only. Keys match
 * `tags.*` in messages/*.json and the address `/daily/tag/<key>`.
 */
export const storyTags = [
  'assistants',
  'agents',
  'vibe-coding',
  'image',
  'video',
  'music',
  'voice',
  'chips',
  'on-device',
  'hardware',
  'health',
  'education',
  'security',
  'deals',
] as const
export type StoryTag = (typeof storyTags)[number]

export const maxStoryTags = 3

/** What each tag means, for the structuring prompt. */
export const tagGuide: Record<StoryTag, string> = {
  assistants: 'AI assistants and chatbots for everyday users, and AI features in everyday apps',
  agents: 'AI agents that take actions, use tools or operate computers',
  'vibe-coding': 'AI for building software: coding assistants and agents, making apps by prompting, developer tools',
  image: 'image generation and editing',
  video: 'video generation and editing',
  music: 'music generation and AI in music',
  voice: 'speech recognition, voice synthesis, voice cloning and voice assistants',
  chips: 'AI chips, GPUs, data centres and compute',
  'on-device': 'AI that runs on phones, laptops and other devices themselves',
  hardware: 'AI hardware products: AI phones and PCs, glasses, wearables and other gadgets',
  health: 'AI in medicine, health care and biology',
  education: 'AI in education and learning',
  security: 'AI safety and security: misuse, attacks, privacy and risks',
  deals: 'funding rounds, investments, acquisitions and IPOs',
}

/** Back-office names (the site's names are in messages). */
export const tagLabels: Record<StoryTag, { en: string; zh: string }> = {
  assistants: { en: 'AI assistants', zh: 'AI助理' },
  agents: { en: 'AI agents', zh: '智能体' },
  'vibe-coding': { en: 'Vibe coding', zh: 'VibeCoding' },
  image: { en: 'AI images', zh: 'AI图像' },
  video: { en: 'AI video', zh: 'AI视频' },
  music: { en: 'AI music', zh: 'AI音乐' },
  voice: { en: 'AI voice', zh: 'AI语音' },
  chips: { en: 'AI chips', zh: 'AI芯片' },
  'on-device': { en: 'On-device AI', zh: '端侧AI' },
  hardware: { en: 'AI hardware', zh: 'AI硬件' },
  health: { en: 'AI in health', zh: 'AI医疗' },
  education: { en: 'AI in education', zh: 'AI教育' },
  security: { en: 'AI safety & security', zh: 'AI安全' },
  deals: { en: 'Funding & deals', zh: '投融资' },
}

export function isStoryTag(value: string): value is StoryTag {
  return (storyTags as readonly string[]).includes(value)
}

/** The stored tags that are still in the list, at most three, without repeats. */
export function tagsOf(value: readonly unknown[] | null | undefined): StoryTag[] {
  const tags: StoryTag[] = []
  for (const item of value ?? []) {
    if (typeof item === 'string' && isStoryTag(item) && !tags.includes(item)) tags.push(item)
    if (tags.length === maxStoryTags) break
  }
  return tags
}
