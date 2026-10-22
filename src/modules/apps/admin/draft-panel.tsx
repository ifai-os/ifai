'use client'

import { Button, toast, useDocumentInfo, useFormModified, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DraftRequestResponse } from '../profile/endpoints'
import type { DraftInfo, DraftReasonCode, DraftStatus } from '../profile/state'

type Draft = { status: DraftStatus | null; info: DraftInfo }

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '资料草稿',
    saveFirst: '先填好名称和官网网址并保存，再生成草稿。',
    none: '还没有生成过。点下面的按钮，按官网写四种语言的介绍、功能、常见问题和标签，并建议分类、定价和平台。',
    pending: (at: string) => `待生成，${at} 提交。生成好会自动刷新这一页；生成期间不要保存这一页。`,
    drafted: (at: string) => `已生成，${at}。核对后再发布。`,
    failed: '没生成：',
    reasons: {
      'switch-off': '模型调用已关闭（MODEL_CALLS_ENABLED），打开后会自动继续。',
      budget: '今天的模型预算用完了，明天（上海时间）自动继续。',
      'no-key': '没有配置 OPENROUTER_API_KEY。',
      fetch: '官网打不开。',
      thin: '官网上读不到多少文字（可能要运行脚本才显示内容），请手动填写。',
      model: '模型调用连续失败。',
      error: '出错了。',
    } satisfies Record<DraftReasonCode, string>,
    checkOk: '名字和数字都能在官网上找到。',
    checkMissing: '这些名字或数字在官网上找不到，发布前核对：',
    dropped: '没有官网原文依据、已留空的建议：',
    fields: { name: '名称', developer: '开发者', pricing: '定价', platforms: '平台', categories: '分类' },
    values: {
      free: '免费',
      freemium: '免费 + 付费',
      paid: '付费',
      'open-source': '开源',
      web: '网页',
      desktop: '桌面端',
      mobile: '手机',
      'browser-extension': '浏览器插件',
      api: 'API',
    } as Record<string, string>,
    locales: { 'zh-Hans': '简体中文', en: '英语', ja: '日语', ko: '韩语' } as Record<string, string>,
    read: '读了：',
    homepage: '官网首页',
    pricingPage: '定价页',
    chars: (count: number) => `共 ${count.toLocaleString()} 字`,
    logo: 'Logo：',
    screenshot: '截图：',
    imageMissing: '没取到',
    generate: '生成草稿',
    regenerate: '重新生成',
    working: '提交中…',
    confirm: '重新生成会覆盖四种语言的介绍、功能、常见问题和标签；分类、定价、平台、开发者和图片已经填了的不动。',
    confirmYes: '确定重新生成',
    cancel: '取消',
    unsaved: '有没保存的修改，先保存再生成。',
    queued: '已提交，正在生成。',
    notQueued: (error: string) => `已标为待生成，但后台任务没连上（${error}），补漏任务会接着处理。`,
    doneUnsaved: '草稿已生成。你有没保存的修改，保存会覆盖草稿；先刷新这一页。',
    failedRequest: '提交失败',
  },
  en: {
    title: 'Profile draft',
    saveFirst: 'Fill in the name and website and save, then generate a draft.',
    none: 'No draft yet. The button below writes the summary, features, FAQ and tags in four languages from the website, and suggests category, pricing and platforms.',
    pending: (at: string) => `Waiting, requested ${at}. This page reloads when the draft is ready; do not save it meanwhile.`,
    drafted: (at: string) => `Drafted ${at}. Check it before publishing.`,
    failed: 'Not written: ',
    reasons: {
      'switch-off': 'Model calls are switched off (MODEL_CALLS_ENABLED); drafts continue once they are on.',
      budget: "Today's model budget is used up; drafts continue tomorrow (Shanghai time).",
      'no-key': 'OPENROUTER_API_KEY is not set.',
      fetch: 'The website could not be opened.',
      thin: 'The website has little readable text (it may need scripts to show it); write the profile by hand.',
      model: 'The model call kept failing.',
      error: 'Something went wrong.',
    } satisfies Record<DraftReasonCode, string>,
    checkOk: 'Every name and number was found on the website.',
    checkMissing: 'Not found on the website; check before publishing:',
    dropped: 'Suggestions left empty because the website does not back them:',
    fields: { name: 'name', developer: 'developer', pricing: 'pricing', platforms: 'platforms', categories: 'category' },
    values: {
      free: 'Free',
      freemium: 'Free + paid',
      paid: 'Paid',
      'open-source': 'Open source',
      web: 'Web',
      desktop: 'Desktop',
      mobile: 'Mobile',
      'browser-extension': 'Browser extension',
      api: 'API',
    } as Record<string, string>,
    locales: { 'zh-Hans': 'Simplified Chinese', en: 'English', ja: 'Japanese', ko: 'Korean' } as Record<string, string>,
    read: 'Read: ',
    homepage: 'homepage',
    pricingPage: 'pricing page',
    chars: (count: number) => `${count.toLocaleString()} characters`,
    logo: 'Logo: ',
    screenshot: 'Screenshot: ',
    imageMissing: 'not found',
    generate: 'Generate draft',
    regenerate: 'Generate again',
    working: 'Sending…',
    confirm: 'This rewrites the summary, description, features, FAQ and tags in four languages. Category, pricing, platforms, developer and images you filled in stay.',
    confirmYes: 'Generate again',
    cancel: 'Cancel',
    unsaved: 'Save your changes first.',
    queued: 'Requested; the draft is being written.',
    notQueued: (error: string) => `Marked as waiting, but the background jobs could not be reached (${error}); the sweep will pick it up.`,
    doneUnsaved: 'The draft is ready. Saving now would overwrite it with your unsaved form; reload the page first.',
    failedRequest: 'Request failed',
  },
}

const POLL_MS = 5000
const POLL_FOR_MS = 15 * 60_000

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** The「资料草稿」panel in an app's sidebar: state, check results and the generate button. */
export function DraftPanel() {
  const { id } = useDocumentInfo()
  const modified = useFormModified()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [draft, setDraft] = useState<Draft | null>(null)
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const modifiedRef = useRef(modified)
  useEffect(() => {
    modifiedRef.current = modified
  }, [modified])

  const load = useCallback(async (): Promise<Draft | null> => {
    const response = await fetch(`/api/apps/${id}?depth=0&select[draftStatus]=true&select[draftInfo]=true`, {
      credentials: 'same-origin',
    })
    if (!response.ok) return null
    const doc = (await response.json()) as { draftStatus?: DraftStatus | null; draftInfo?: DraftInfo | null }
    return { status: doc.draftStatus ?? null, info: doc.draftInfo ?? {} }
  }, [id])

  useEffect(() => {
    if (id) void load().then(setDraft)
  }, [id, load])

  // While waiting, look again every few seconds; reload the form once the draft is written.
  useEffect(() => {
    if (draft?.status !== 'pending') return
    const started = Date.now()
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) clearInterval(timer)
      const next = await load()
      if (!next || next.status === 'pending') return
      clearInterval(timer)
      if (modifiedRef.current) {
        setDraft(next)
        toast.warning(t.doneUnsaved)
      } else {
        window.location.reload()
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [draft?.status, load, t])

  if (!id) return <div style={box}>{t.saveFirst}</div>

  async function generate() {
    setConfirming(false)
    setSending(true)
    try {
      const response = await fetch(`/api/apps/${id}/draft`, { method: 'POST', credentials: 'same-origin' })
      const data = (await response.json()) as DraftRequestResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      if (data.queued.ok) toast.success(t.queued)
      else toast.warning(t.notQueued(data.queued.error))
      setDraft({ status: 'pending', info: { requestedAt: data.requestedAt } })
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSending(false)
    }
  }

  const info = draft?.info ?? {}
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(i18n.language) : '')
  const check = draft?.status === 'drafted' ? info.check : undefined
  const missingByLocale = new Map<string, string[]>()
  for (const { locale, token } of check?.missing ?? []) missingByLocale.set(locale, [...(missingByLocale.get(locale) ?? []), token])

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      <p style={{ margin: '0.25em 0 0' }}>
        {draft === null
          ? '…'
          : draft.status === 'pending'
            ? t.pending(when(info.requestedAt))
            : draft.status === 'drafted'
              ? t.drafted(when(info.generatedAt))
              : draft.status === 'failed'
                ? `${t.failed}${info.reason ? t.reasons[info.reason.code] : ''}`
                : t.none}
      </p>
      {info.reason && draft?.status !== 'drafted' && (
        <p style={{ margin: '0.25em 0 0' }}>
          {draft?.status === 'pending' && <>{t.reasons[info.reason.code]} </>}
          <small style={{ wordBreak: 'break-word' }}>{info.reason.detail}</small>
        </p>
      )}

      {check && (
        <div style={{ marginTop: '0.5em' }}>
          {check.ok ? (
            <p style={{ margin: 0 }}>✓ {t.checkOk}</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>⚠ {t.checkMissing}</p>
              <ul style={{ margin: '0.25em 0 0', paddingLeft: '1.25em' }}>
                {[...missingByLocale].map(([locale, tokens]) => (
                  <li key={locale}>
                    {t.locales[locale] ?? locale}：{tokens.join('、')}
                  </li>
                ))}
              </ul>
            </>
          )}
          {check.dropped.length > 0 && (
            <>
              <p style={{ margin: '0.5em 0 0' }}>{t.dropped}</p>
              <ul style={{ margin: '0.25em 0 0', paddingLeft: '1.25em' }}>
                {check.dropped.map((fact, index) => (
                  <li key={index} style={{ wordBreak: 'break-word' }}>
                    {t.fields[fact.field]}：{t.values[fact.value] ?? fact.value}
                    {fact.quote ? <small>（“{fact.quote}”）</small> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {draft?.status === 'drafted' && info.material && (
        <p style={{ margin: '0.5em 0 0' }}>
          <small>
            {t.read}
            <a href={info.material.url} target="_blank" rel="noreferrer">
              {t.homepage}
            </a>
            {info.material.pricingUrl && (
              <>
                {' · '}
                <a href={info.material.pricingUrl} target="_blank" rel="noreferrer">
                  {t.pricingPage}
                </a>
              </>
            )}
            {' · '}
            {t.chars(info.material.chars)}
          </small>
        </p>
      )}
      {draft?.status === 'drafted' && info.images && (
        <p style={{ margin: '0.25em 0 0', wordBreak: 'break-word' }}>
          <small>
            {info.images.logo && (
              <>
                {t.logo}
                {info.images.logo.startsWith('not found') ? t.imageMissing : '✓'}{' '}
              </>
            )}
            {info.images.screenshot && (
              <>
                {t.screenshot}
                {info.images.screenshot.startsWith('not found') ? t.imageMissing : '✓'}
              </>
            )}
          </small>
        </p>
      )}

      <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
        {confirming ? (
          <>
            <p style={{ margin: '0 0 0.5em' }}>{t.confirm}</p>
            <Button buttonStyle="primary" size="small" onClick={generate}>
              {t.confirmYes}
            </Button>{' '}
            <Button buttonStyle="secondary" size="small" onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </>
        ) : (
          <Button
            buttonStyle="secondary"
            size="small"
            disabled={sending || draft === null || draft.status === 'pending' || modified}
            tooltip={modified ? t.unsaved : undefined}
            onClick={() => (draft?.status === 'drafted' ? setConfirming(true) : generate())}
          >
            {sending ? t.working : draft?.status === 'drafted' || draft?.status === 'failed' ? t.regenerate : t.generate}
          </Button>
        )}
      </div>
    </div>
  )
}
