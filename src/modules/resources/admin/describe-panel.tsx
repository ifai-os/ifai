'use client'

import { Button, toast, useDocumentInfo, useFormModified, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DescribeRequestResponse } from '../describe/endpoints'
import type { DraftInfo, DraftReasonCode, DraftStatus } from '../describe/state'

type Draft = { status: DraftStatus | null; info: DraftInfo; skillId: number | null }

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '说明草稿',
    saveFirst: '先保存版本（上传或导入 Zip），再生成说明草稿。',
    none: '还没有生成过。点下面的按钮，按这个版本的 SKILL.md、README 和文件清单，给 Skill 写四种语言的显示名、一句话介绍、能力、使用示例、工作流程和注意事项，并把外联域名、读写范围、工具和 API Key 填进本版本的声明。',
    pending: (at: string) => `待生成，${at} 提交。生成好会自动刷新这一页；生成期间不要保存这一页。`,
    drafted: (at: string) => `已生成，${at}。`,
    failed: '没生成：',
    reasons: {
      'switch-off': '模型调用已关闭（MODEL_CALLS_ENABLED），打开后会自动继续。',
      budget: '今天的模型预算用完了，明天（上海时间）自动继续。',
      'no-key': '没有配置 OPENROUTER_API_KEY。',
      thin: '这个版本没有可用的 SKILL.md 正文，重新上传或导入 Zip 后再试。',
      model: '模型调用连续失败。',
      error: '出错了。',
    } satisfies Record<DraftReasonCode, string>,
    wrote: (locales: string) => `已写入 Skill 的说明（${locales}），繁体由简体自动生成。`,
    wroteNone: 'Skill 的说明都已经填过，这次没有改动文字。',
    skillLink: '去 Skill 页审核',
    declarationsKept: '这个版本已发布，声明没有改（规则 2）。',
    checkOk: '名字和数字都能在 SKILL.md、README 里找到。',
    checkMissing: '这些名字或数字在文件里找不到，发布前核对：',
    dropped: '文件里没有、已经去掉的声明：',
    fields: { domains: '域名', tools: '工具', apiKeys: 'API Key' },
    locales: { 'zh-Hans': '简体中文', en: '英语', ja: '日语', ko: '韩语' } as Record<string, string>,
    generate: '生成说明草稿',
    regenerate: '重新生成',
    working: '提交中…',
    confirm: '会按这个版本重写 Skill 四种语言的一句话介绍、能力、使用示例、工作流程和注意事项；显示名只在空着时填，试用笔记不动。本版本的声明也按文件重写（已发布的版本不改）。',
    confirmYes: '确定生成',
    cancel: '取消',
    unsaved: '有没保存的修改，先保存再生成。',
    queued: '已提交，正在生成。',
    notQueued: (error: string) => `已标为待生成，但后台任务没连上（${error}），补漏任务会接着处理。`,
    doneUnsaved: '草稿已生成。你有没保存的修改，保存会覆盖草稿；先刷新这一页。',
    failedRequest: '提交失败',
  },
  en: {
    title: 'Description draft',
    saveFirst: 'Save the version (upload or import its Zip) first, then draft the description.',
    none: 'No draft yet. The button below writes the Skill’s display name, one-line summary, capabilities, example, workflow and notes in four languages from this version’s SKILL.md, README and file list, and fills this version’s declarations (domains, file scope, tools, API keys).',
    pending: (at: string) => `Waiting, requested ${at}. This page reloads when the draft is ready; do not save it meanwhile.`,
    drafted: (at: string) => `Drafted ${at}.`,
    failed: 'Not written: ',
    reasons: {
      'switch-off': 'Model calls are switched off (MODEL_CALLS_ENABLED); drafts continue once they are on.',
      budget: "Today's model budget is used up; drafts continue tomorrow (Shanghai time).",
      'no-key': 'OPENROUTER_API_KEY is not set.',
      thin: 'This version has no usable SKILL.md text; upload or import its Zip again.',
      model: 'The model call kept failing.',
      error: 'Something went wrong.',
    } satisfies Record<DraftReasonCode, string>,
    wrote: (locales: string) => `Written to the Skill’s description (${locales}); Traditional Chinese follows Simplified automatically.`,
    wroteNone: 'The Skill’s description was already filled in; no text was changed.',
    skillLink: 'Review on the Skill page',
    declarationsKept: 'This version is published, so its declarations stayed as they were (rule 2).',
    checkOk: 'Every name and number was found in SKILL.md or the README.',
    checkMissing: 'Not found in the files; check before publishing:',
    dropped: 'Suggested declarations the files do not contain, left out:',
    fields: { domains: 'domain', tools: 'tool', apiKeys: 'API key' },
    locales: { 'zh-Hans': 'Simplified Chinese', en: 'English', ja: 'Japanese', ko: 'Korean' } as Record<string, string>,
    generate: 'Draft the description',
    regenerate: 'Draft again',
    working: 'Sending…',
    confirm: 'This rewrites the Skill’s one-line summary, capabilities, example, workflow and notes in four languages from this version; the display name is only filled in where empty and your field notes stay. This version’s declarations are rewritten from the files too (a published version keeps its own).',
    confirmYes: 'Draft now',
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

/** The「说明草稿」panel in a version's sidebar: state, check results and the draft button. */
export function DescribePanel() {
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
    const response = await fetch(`/api/skill-versions/${id}?depth=0&select[draftStatus]=true&select[draftInfo]=true&select[skill]=true`, {
      credentials: 'same-origin',
    })
    if (!response.ok) return null
    const doc = (await response.json()) as { draftStatus?: DraftStatus | null; draftInfo?: DraftInfo | null; skill?: number | null }
    return { status: doc.draftStatus ?? null, info: doc.draftInfo ?? {}, skillId: typeof doc.skill === 'number' ? doc.skill : null }
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
      const response = await fetch(`/api/skill-versions/${id}/describe`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'rewrite' }),
      })
      const data = (await response.json()) as DescribeRequestResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      if (data.queued.ok) toast.success(t.queued)
      else toast.warning(t.notQueued(data.queued.error))
      setDraft((previous) => ({ status: 'pending', info: { requestedAt: data.requestedAt, mode: data.mode }, skillId: previous?.skillId ?? null }))
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

      {draft?.status === 'drafted' && (
        <div style={{ marginTop: '0.5em' }}>
          <p style={{ margin: 0 }}>
            {info.wrote?.length ? t.wrote(info.wrote.map((locale) => t.locales[locale] ?? locale).join(', ')) : t.wroteNone}{' '}
            {draft.skillId && (
              <a href={`/admin/collections/skills/${draft.skillId}`} target="_blank" rel="noreferrer">
                {t.skillLink}
              </a>
            )}
          </p>
          {info.declarations === false && <p style={{ margin: '0.25em 0 0' }}>{t.declarationsKept}</p>}
          {check &&
            (check.ok ? (
              <p style={{ margin: '0.25em 0 0' }}>✓ {t.checkOk}</p>
            ) : (
              <>
                <p style={{ margin: '0.25em 0 0' }}>⚠ {t.checkMissing}</p>
                <ul style={{ margin: '0.25em 0 0', paddingLeft: '1.25em' }}>
                  {[...missingByLocale].map(([locale, tokens]) => (
                    <li key={locale}>
                      {t.locales[locale] ?? locale}：{tokens.join('、')}
                    </li>
                  ))}
                </ul>
              </>
            ))}
          {check && check.dropped.length > 0 && (
            <>
              <p style={{ margin: '0.5em 0 0' }}>{t.dropped}</p>
              <ul style={{ margin: '0.25em 0 0', paddingLeft: '1.25em' }}>
                {check.dropped.map((item, index) => (
                  <li key={index} style={{ wordBreak: 'break-word' }}>
                    {t.fields[item.field]}：{item.value}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
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
            onClick={() => setConfirming(true)}
          >
            {sending ? t.working : draft?.status === 'drafted' || draft?.status === 'failed' ? t.regenerate : t.generate}
          </Button>
        )}
      </div>
    </div>
  )
}
