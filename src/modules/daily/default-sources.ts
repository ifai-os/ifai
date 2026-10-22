import type { JsonConfig } from './source-config'
import type { HtmlListConfig, SourceTier, SourceUse } from './types'

export type DefaultSource = {
  name: string
  type: 'rss' | 'html_list' | 'json'
  url: string
  homepage: string
  tier: SourceTier
  use: SourceUse
  enabled: boolean
  intervalMinutes: number
  config?: HtmlListConfig | JsonConfig
  notes?: string
}

const SELECTORS_PENDING =
  '选择器是占位值。先用「试抓」确认抓到的是文章、日期也对，再填好选择器并启用（docs/specs/daily.md「信源」）。'

/**
 * The first batch from the spec: 6 media and aggregator sites plus 10 official feeds.
 * The three sites without a feed stay disabled until their selectors are confirmed with a
 * test fetch. Imported once by a migration; the owner edits them in /admin afterwards.
 */
export const defaultSources: DefaultSource[] = [
  {
    name: 'Future Tools 新闻',
    type: 'html_list',
    url: 'https://www.futuretools.io/news',
    homepage: 'https://www.futuretools.io',
    tier: 'T2',
    use: 'editorial',
    enabled: false,
    intervalMinutes: 60,
    config: { item: 'a[href^="http"]', group: 'section', groupDate: 'h2', skipHosts: ['futuretools.io'] },
    notes: `发现源：每天 3–12 条，按天分组，只有日期。每条外链到原文，入库时去掉 utm 参数；站方的 TLDR 有错，摘要以原文为准。${SELECTORS_PENDING}`,
  },
  {
    name: 'The Rundown',
    type: 'html_list',
    url: 'https://www.therundown.ai/articles',
    homepage: 'https://www.therundown.ai',
    tier: 'T2',
    use: 'editorial',
    enabled: false,
    intervalMinutes: 60,
    config: { item: 'article', link: 'a[href]', skipHosts: [] },
    notes: `单主题文章。列表页不给日期，发布时间在取原文时从详情页读。${SELECTORS_PENDING}`,
  },
  {
    name: 'Forward Future 日报',
    type: 'html_list',
    url: 'https://www.forwardfuture.ai/newsletter/daily',
    homepage: 'https://www.forwardfuture.ai',
    tier: 'T2',
    use: 'roundup',
    enabled: false,
    intervalMinutes: 60,
    config: { item: 'article', link: 'a[href]' },
    notes: `工作日每期一份，每期 5–7 个话题。汇总稿：只把它提到的新闻挂到事件上并计入热度。${SELECTORS_PENDING}`,
  },
  {
    name: 'TechCrunch AI',
    type: 'rss',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    homepage: 'https://techcrunch.com/category/artificial-intelligence/',
    tier: 'T2',
    use: 'editorial',
    enabled: true,
    intervalMinutes: 30,
    notes: '约每天 10 条。有 RSS 使用条款：只用标题、链接和我们自己写的摘要。',
  },
  {
    name: 'The Verge AI',
    type: 'rss',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    homepage: 'https://www.theverge.com/ai-artificial-intelligence',
    tier: 'T2',
    use: 'editorial',
    enabled: true,
    intervalMinutes: 30,
  },
  {
    name: 'Hacker News',
    type: 'json',
    url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
    homepage: 'https://news.ycombinator.com',
    tier: 'T2',
    use: 'hot_signal',
    enabled: true,
    intervalMinutes: 60,
    config: { kind: 'hacker_news', minPoints: 50 },
    notes: '首页 30 条里通常只有 5 条左右和 AI 相关，靠预筛过滤。分数和评论数算作热度证据。',
  },
  official('OpenAI News', 'https://openai.com/news/rss.xml', 'https://openai.com/news/'),
  official('Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'https://deepmind.google/blog/'),
  official('Google Research', 'https://research.google/blog/rss/', 'https://research.google/blog/'),
  official('Hugging Face', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co/blog'),
  official('Microsoft Research', 'https://www.microsoft.com/en-us/research/feed/', 'https://www.microsoft.com/en-us/research/blog/'),
  official('NVIDIA', 'https://blogs.nvidia.com/feed/', 'https://blogs.nvidia.com/'),
  official('AWS Machine Learning', 'https://aws.amazon.com/blogs/machine-learning/feed/', 'https://aws.amazon.com/blogs/machine-learning/'),
  official('GitHub（AI 与 ML）', 'https://github.blog/ai-and-ml/feed/', 'https://github.blog/ai-and-ml/'),
  official('Mistral', 'https://mistral.ai/news/rss', 'https://mistral.ai/news'),
  official('BAIR', 'https://bair.berkeley.edu/blog/feed.xml', 'https://bair.berkeley.edu/blog/'),
]

function official(name: string, url: string, homepage: string): DefaultSource {
  return { name, type: 'rss', url, homepage, tier: 'T1', use: 'editorial', enabled: true, intervalMinutes: 60 }
}
