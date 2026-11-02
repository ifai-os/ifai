import { bodyFor, describe, push, readPage, settings } from './push.js'

const MENU = { news: '推到 IFAI：新闻', app: '推到 IFAI：应用 / 工具' }

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    for (const [kind, title] of Object.entries(MENU)) {
      chrome.contextMenus.create({ id: `page-${kind}`, title, contexts: ['page'] })
      chrome.contextMenus.create({ id: `link-${kind}`, title: `${title}（这个链接）`, contexts: ['link'] })
    }
  })
  if (reason === 'install') chrome.runtime.openOptionsPage()
})

/** The right-click menu has no popup, so the result shows on the toolbar icon: a badge and its tooltip. */
async function flag(tabId, text, color, title) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color })
  await chrome.action.setBadgeText({ tabId, text })
  await chrome.action.setTitle({ tabId, title })
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 8000)
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const [where, kind] = String(info.menuItemId).split('-')
  const tabId = tab?.id
  try {
    let page
    if (where === 'link') {
      page = { url: info.linkUrl, canonical: null, title: info.selectionText || null, summary: null, siteName: null, appName: null, publishedAt: null, types: [] }
    } else {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: readPage })
      page = result
    }
    const { server } = await settings()
    const message = describe(await push(bodyFor(kind, page)), server)
    await flag(tabId, '✓', '#1f7a3a', `${message.title}\n${message.detail}${message.warning ? `\n${message.warning}` : ''}`)
  } catch (error) {
    await flag(tabId, '!', '#c0392b', `没推成：${error instanceof Error ? error.message : error}`)
  }
})
