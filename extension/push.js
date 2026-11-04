// Shared by the popup, the right-click menu and the settings page.

/**
 * Settings saved on the settings page: the site's address (no trailing slash), the push token, and
 * Vercel's protection bypass secret for a deployment behind Vercel's access protection (previews).
 */
export async function settings() {
  const { server = '', token = '', bypass = '' } = await chrome.storage.local.get(['server', 'token', 'bypass'])
  return { server, token, bypass }
}

/** The request headers: our token, and Vercel's bypass header when the site is protected (docs/setup.md step 3). */
export function requestHeaders({ token, bypass }, hasBody) {
  return {
    Authorization: `Bearer ${token}`,
    ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  }
}

/**
 * Why a request failed, in words. Our endpoint answers JSON; a 401 or 403 without it comes from
 * Vercel's access protection in front of the site, not from a wrong token.
 */
export function failureMessage(status, data, { bypass }) {
  if (status === 401 && data?.error === 'unauthorized') return '令牌不对：和网站的 PUSH_TOKEN 不一致。'
  if (status === 401 || status === 403) {
    return bypass
      ? '被 Vercel 的访问保护挡住了：保护绕过密钥不对，在 Vercel 项目的 Deployment Protection 里复制一遍。'
      : '被 Vercel 的访问保护挡住了：这个网站是开着保护的预览，在设置页填上保护绕过密钥。'
  }
  if (status === 404 && !data?.error) return '这个网站没有推送接口：地址对吗？网站要部署了浏览器推送之后的版本。'
  return data?.message || `网站返回 ${status}`
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
  const current = await settings()
  const { server, token } = current
  if (!server || !token) throw new Error('先在设置页填好网站地址和推送令牌。')
  let response
  try {
    response = await fetch(`${server}/api/push`, {
      method,
      headers: requestHeaders(current, Boolean(body)),
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(`连不上 ${server}。地址对吗？设置页保存时要允许访问这个网站。`)
  }
  const data = await response.json().catch(() => null)
  // Vercel's protection can also answer by sending the browser off to its login page.
  if (response.redirected && new URL(response.url).origin !== new URL(server).origin) throw new Error(failureMessage(401, null, current))
  if (!response.ok) throw new Error(failureMessage(response.status, data, current))
  if (!data || !(data.ok || data.kind)) throw new Error('网站的回答看不懂：地址对吗？')
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
