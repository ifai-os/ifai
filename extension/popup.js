import { bodyFor, describe, guessKind, push, readPage, settings } from './push.js'

const $ = (id) => document.getElementById(id)

function show({ ok, title, detail, link, warning }) {
  $('result').hidden = false
  $('result').className = ok ? 'ok' : 'failed'
  $('result-title').textContent = title
  $('result-detail').textContent = detail ?? ''
  $('result-warning').hidden = !warning
  $('result-warning').textContent = warning ?? ''
  $('result-link').hidden = !link
  if (link) $('result-link').href = link
}

$('options').addEventListener('click', (event) => {
  event.preventDefault()
  chrome.runtime.openOptionsPage()
})

async function main() {
  const { server, token } = await settings()
  if (!server || !token) {
    show({ ok: false, title: '还没设置', detail: '先在设置页填好网站地址和推送令牌。' })
    for (const id of ['news', 'app']) $(id).disabled = true
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let page
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage })
    page = result
  } catch {
    // Chrome's own pages and the Web Store do not allow scripts: push the address alone.
    page = { url: tab.url, canonical: null, title: tab.title, summary: null, siteName: null, appName: null, publishedAt: null, types: [] }
  }
  if (!/^https?:/.test(page.url)) {
    show({ ok: false, title: '这一页推不了', detail: '只能推 http(s) 网页。' })
    for (const id of ['news', 'app']) $(id).disabled = true
    return
  }

  $('page-title').textContent = page.title || page.url
  $('page-site').textContent = new URL(page.url).hostname
  const guess = guessKind(page)
  $(guess).classList.add('primary')
  $(guess).focus()
  $('guess').textContent = guess === 'news' ? '看着像一篇新闻。' : '看着像一个工具的网站。'

  for (const kind of ['news', 'app']) {
    $(kind).addEventListener('click', async () => {
      for (const id of ['news', 'app']) $(id).disabled = true
      $(kind).textContent = '推送中…'
      try {
        show(describe(await push(bodyFor(kind, page)), server))
        $(kind).textContent = '已推送'
      } catch (error) {
        show({ ok: false, title: '没推成', detail: error instanceof Error ? error.message : String(error) })
        $(kind).textContent = kind === 'news' ? '推为新闻' : '推为应用 / 工具'
        for (const id of ['news', 'app']) $(id).disabled = false
      }
    })
  }
}

main()
