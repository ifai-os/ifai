import { call, originPattern, settings } from './push.js'

const $ = (id) => document.getElementById(id)

settings().then(({ server, token }) => {
  $('server').value = server
  $('token').value = token
})

function status(text, ok) {
  $('status').textContent = text
  $('status').className = `small ${ok ? 'ok-text' : 'warning'}`
}

$('form').addEventListener('submit', async (event) => {
  event.preventDefault()
  let server
  try {
    server = new URL($('server').value.trim()).origin
  } catch {
    return status('网站地址不对。', false)
  }
  // Asked here, on a click: the extension may only talk to the one site it is set up for.
  const granted = await chrome.permissions.request({ origins: [originPattern(server)] })
  if (!granted) return status('没有允许访问这个网站，推送会连不上。', false)
  await chrome.storage.local.set({ server, token: $('token').value.trim() })
  $('server').value = server
  status('已保存，测试连接中…', true)
  try {
    const result = await call('GET')
    const off = [!result.collectEnabled && 'COLLECT_ENABLED', !result.modelCallsEnabled && 'MODEL_CALLS_ENABLED'].filter(Boolean)
    status(off.length ? `连上了。不过这个环境的 ${off.join('、')} 没打开，推进去的新闻要等打开后才会往下走。` : '连上了，可以推送。', true)
  } catch (error) {
    status(error instanceof Error ? error.message : String(error), false)
  }
})
