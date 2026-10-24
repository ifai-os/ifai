/**
 * Industry tags of a story (docs/specs/daily.md「详情页：行业标签…」). A story has one category
 * but up to three tags; the structuring step picks them from this fixed list only. Keys match
 * `tags.*` in messages/*.json and the address `/daily/tag/<key>`.
 */
export const storyTags = [
  'llm',
  'assistants',
  'agents',
  'coding',
  'image',
  'video',
  'audio',
  'search',
  'chips',
  'on-device',
  'devices',
  'robotics',
  'driving',
  'health',
  'education',
  'finance',
  'enterprise',
  'security',
  'policy',
  'deals',
] as const
export type StoryTag = (typeof storyTags)[number]

export const maxStoryTags = 3

/** What each tag means, for the structuring prompt. */
export const tagGuide: Record<StoryTag, string> = {
  llm: 'large language models and foundation models themselves',
  assistants: 'chat assistants and AI features for everyday users',
  agents: 'AI agents that take actions, use tools or computers',
  coding: 'coding assistants, developer tools and AI for software engineering',
  image: 'image generation and editing',
  video: 'video generation and editing',
  audio: 'speech, voice, audio and music',
  search: 'AI search and answer engines',
  chips: 'chips, GPUs, data centres and compute',
  'on-device': 'AI that runs on phones, laptops and other devices themselves',
  devices: 'consumer electronics: phones, computers, wearables, glasses',
  robotics: 'robots and embodied AI',
  driving: 'self-driving cars and autonomous vehicles',
  health: 'medicine, health care and biology',
  education: 'education and learning',
  finance: 'finance, banking and markets',
  enterprise: 'AI for businesses: enterprise software, cloud services, workplace tools',
  security: 'security, safety, privacy and misuse',
  policy: 'law, regulation, government policy and lawsuits',
  deals: 'funding rounds, acquisitions, IPOs and big partnerships',
}

/** Back-office names (the site's names are in messages). */
export const tagLabels: Record<StoryTag, { en: string; zh: string }> = {
  llm: { en: 'Large models', zh: '大模型' },
  assistants: { en: 'AI assistants', zh: 'AI 助手' },
  agents: { en: 'Agents', zh: '智能体' },
  coding: { en: 'Coding', zh: '编程与开发' },
  image: { en: 'Images', zh: '图像' },
  video: { en: 'Video', zh: '视频' },
  audio: { en: 'Voice & music', zh: '语音与音乐' },
  search: { en: 'Search', zh: '搜索' },
  chips: { en: 'Chips & compute', zh: '芯片与算力' },
  'on-device': { en: 'On-device AI', zh: '端侧 AI' },
  devices: { en: 'Consumer electronics', zh: '消费电子' },
  robotics: { en: 'Robotics', zh: '机器人' },
  driving: { en: 'Self-driving', zh: '自动驾驶' },
  health: { en: 'Health', zh: '医疗健康' },
  education: { en: 'Education', zh: '教育' },
  finance: { en: 'Finance', zh: '金融' },
  enterprise: { en: 'Enterprise', zh: '企业服务' },
  security: { en: 'Security', zh: '安全' },
  policy: { en: 'Policy', zh: '政策与监管' },
  deals: { en: 'Funding & deals', zh: '融资与并购' },
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
