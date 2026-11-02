// Shared by the popup, the right-click menu and the settings page.

/** Settings saved on the settings page: the site's address (no trailing slash) and the push token. */
export async function settings() {
  const { server = '', token = '' } = await chrome.storage.local.get(['server', 'token'])
  return { server, token }
}

export function originPattern(server) {
  return `${new URL(server).origin}/*`
}

/** Runs inside the page (chrome.scripting): what the page says about itself. Must stay self-contained. */
export function readPage() {
  const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim() || null
  const types = []
  let jsonLdPublished = null
  let jsonLdName = null
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent || 'null')
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data?.['@graph'] ?? [])].filter((node) => node && typeof node === 'object' && !Array.isArray(node))
      for (const node of nodes) {
        for (const type of [].concat(node['@type'] ?? [])) types.push(String(type))
        jsonLdPublished ??= typeof node.datePublished === 'string' ? node.datePublished : null
        if (/Application$/.test([].concat(node['@type'] ?? []).join(' ')) && typeof node.name === 'string') jsonLdName ??= node.name
      }
    } catch {
      // Broken JSON-LD is common; the meta tags are enough.
    }
  }
  const canonical = document.querySelector('link[rel="canonical"]')?.href || null
  return {
    url: location.href,
    canonical,
    title: meta('meta[property="og:title"]') || document.title || null,
    summary: meta('meta[property="og:description"]') || meta('meta[name="description"]'),
    siteName: meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]'),
    appName: jsonLdName,
    ogType: meta('meta[property="og:type"]'),
    publishedAt:
      meta('meta[property="article:published_time"]') ||
      meta('meta[name="article:published_time"]') ||
      meta('meta[itemprop="datePublished"]') ||
      meta('meta[name="parsely-pub-date"]') ||
      meta('meta[name="date"]') ||
      jsonLdPublished,
    types,
  }
}

const siteOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** News or a tool? Articles say so (og:type, a published time, JSON-LD); a site's front page is a tool. */
export function guessKind(page) {
  const types = page.types.join(' ')
  if (/(News)?Article|BlogPosting|Report/.test(types) || page.ogType === 'article' || page.publishedAt) return 'news'
  if (/SoftwareApplication|WebApplication|MobileApplication/.test(types)) return 'app'
  const path = new URL(page.url).pathname.replace(/\/+$/, '')
  return path.split('/').filter(Boolean).length >= 2 ? 'news' : 'app'
}

/** The request body for POST /api/push. The canonical address wins when it is on the same site. */
export function bodyFor(kind, page) {
  const url = page.canonical && siteOf(page.canonical) === siteOf(page.url) ? page.canonical : page.url
  if (kind === 'app') return { kind, url, title: page.title, name: page.appName || page.siteName || undefined }
  return { kind, url, title: page.title, summary: page.summary, publishedAt: page.publishedAt, siteName: page.siteName }
}

export async function call(method, body) {
  const { server, token } = await settings()
  if (!server || !token) throw new Error('先在设置页填好网站地址和推送令牌。')
  let response
  try {
    response = await fetch(`${server}/api/push`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(`连不上 ${server}。地址对吗？设置页保存时要允许访问这个网站。`)
  }
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) throw new Error('令牌不对：和网站的 PUSH_TOKEN 不一致。')
  if (!response.ok) throw new Error(data.message || `网站返回 ${response.status}`)
  return data
}

export const push = (body) => call('POST', body)

const STORY_STATUS = { pending: '待审核', published: '已发布', rejected: '已拒绝', merged: '已合并', withdrawn: '已撤回' }
const OUTCOME = {
  pending: '等待判断',
  queued: '排队判断中',
  irrelevant: '判断为与 AI 无关',
  below_threshold: '评分没过线',
  grouped: '已归入事件',
  written: '已写成新闻',
  roundup: '汇总类，只用来串事件',
}

/** The server's answer → a headline, a detail line and an admin link for the popup. */
export function describe(result, server) {
  const off = []
  if (result.collectEnabled === false) off.push('COLLECT_ENABLED')
  if (result.modelCallsEnabled === false) off.push('MODEL_CALLS_ENABLED')
  const warning = off.length ? `注意：网站的 ${off.join('、')} 没打开，流程暂时不会往下走。` : null

  if (result.kind === 'app') {
    const link = `${server}/admin/collections/apps/${result.id}`
    if (result.action === 'known') return { ok: true, title: `已有这个应用：${result.name}`, detail: '按域名判重，没有重复添加。', link, warning: null }
    const detail = result.queued?.ok === false ? '已建成草稿，资料草稿没能排上队，后台每 20 分钟会补上。' : '已建成草稿应用，正在生成资料草稿，好了在后台审。'
    return { ok: true, title: `已添加：${result.name}`, detail, link, warning }
  }

  if (result.action === 'known') {
    const story = result.story
    const link = story ? `${server}/admin/collections/stories/${story.id}` : null
    const where = story
      ? `新闻「${story.slug}」${STORY_STATUS[story.status] ?? story.status}`
      : result.status === 'archived'
        ? '存档了（发布超过 48 小时，或是信源第一次抓到的旧文）'
        : OUTCOME[result.outcome] ?? '在流程里'
    const reason = result.outcomeReason && !story ? `（${result.outcomeReason}）` : ''
    return { ok: true, title: `已经有了（${result.source.name}）`, detail: `${where}${reason}。按网址判重，没有重复添加。`, link, warning: null }
  }

  if (result.status === 'archived') {
    return { ok: true, title: '已收下，但只存档', detail: '这篇发布超过 48 小时，和采集规则一样不进日报。', link: null, warning: null }
  }
  const source = result.source.created ? `新建了停用的信源「${result.source.name}」` : `记在信源「${result.source.name}」下`
  const next = result.queued?.ok === false ? '取正文没能排上队，一小时内后台会补上，然后判断、写作' : '接下来取正文、判断、写作'
  return { ok: true, title: '已推进采集流程', detail: `${source}；${next}，过了会出现在后台待审核的新闻里。`, link: `${server}/admin/collections/stories?where[status][equals]=pending`, warning }
}
