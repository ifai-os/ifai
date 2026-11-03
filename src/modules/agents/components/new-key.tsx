'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/components/button'
import { Icon } from '@/components/icon'

/** Copies one line, and says so for a moment. */
function CopyLine({ text, label }: { text: string; label: string }) {
  const t = useTranslations('agents')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // No clipboard access: the text is on screen to select by hand.
    }
  }

  return (
    <div className="flex items-start gap-2">
      <code className="min-w-0 flex-1 rounded-thumb border border-line bg-bg px-3 py-2 font-mono text-meta break-all text-ink select-all">{text}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`${t('copy')} ${label}`}
        className="inline-flex h-9 flex-none items-center gap-1.5 rounded-btn border border-line bg-bg px-3 text-meta font-medium text-ink hover:border-ink-4"
      >
        <Icon name={copied ? 'check' : 'copy'} size={15} />
        {copied ? t('copied') : t('copy')}
      </button>
    </div>
  )
}

/**
 * The key just made, shown this once (IFAI keeps only its hash), with the lines that connect an
 * agent to IFAI with it.
 */
export function NewKey({ value, origin, onDone }: { value: string; origin: string; onDone: () => void }) {
  const t = useTranslations('agents')
  return (
    <div role="status" className="flex flex-col gap-3 rounded-tile border border-ink p-4">
      <p className="text-ui font-semibold">{t('newKeyTitle')}</p>
      <p className="text-meta text-ink-3">{t('newKeyBody')}</p>
      <CopyLine text={value} label={t('keyWord')} />
      <p className="pt-1 text-ui font-medium">{t('connectTitle')}</p>
      <p className="text-meta text-ink-3">{t('connectClaude')}</p>
      <CopyLine text={`claude mcp add --transport http ifai ${origin}/mcp --header "Authorization: Bearer ${value}"`} label="Claude Code" />
      <p className="text-meta text-ink-3">{t('connectApi')}</p>
      <CopyLine text={`curl -H "Authorization: Bearer ${value}" ${origin}/api/v1/me`} label="curl" />
      <p className="text-meta text-ink-3">{t('connectOther', { url: `${origin}/mcp` })}</p>
      <Button variant="secondary" onClick={onDone} className="self-start">
        {t('done')}
      </Button>
    </div>
  )
}
