'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { InitialTile, toneFor } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'

import type { HostOption } from '../data'

type InstallPanelProps = {
  slug: string
  version: string
  hosts: HostOption[]
  /** The sentence to copy for each host, in the reader's language, keyed by host slug. */
  instructions: Record<string, string>
  zipHref: string
  /** Null when this version installs; otherwise why the buttons are off. */
  disabled: string | null
  /** A newer version that is still being checked or did not pass. */
  pending: string | null
}

/**
 * The install panel (docs/specs/resources.md「页面与路由」, rule 7): pick a host, then copy the
 * sentence that sends the reader's assistant to install.md, or download the Zip. Copying is
 * counted as an install here; the download is counted by the Zip route.
 */
export function InstallPanel({ slug, version, hosts, instructions, zipHref, disabled, pending }: InstallPanelProps) {
  const t = useTranslations('resources')
  const [host, setHost] = useState(hosts[0]?.slug ?? '')
  const [copied, setCopied] = useState(false)
  const picked = hosts.find((item) => item.slug === host) ?? hosts[0]
  const instruction = (picked && instructions[picked.slug]) ?? ''

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(instruction)
      setCopied(true)
    } catch {
      // No clipboard access: the sentence is on screen to select by hand.
      return
    }
    const body = JSON.stringify({ version, host: picked?.slug ?? null })
    const url = `/api/skills/${slug}/installs`
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) {
      void fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {})
    }
  }

  return (
    <section id="install" aria-labelledby="install-title" className="flex scroll-mt-20 flex-col gap-3.5 rounded-hero border border-surface-2 bg-surface p-5">
      <h2 id="install-title" className="text-title font-semibold">
        {t('install.title')}
      </h2>
      {pending && <p className="rounded-thumb bg-bg px-3 py-2 text-meta text-ink-2">{pending}</p>}

      {hosts.length > 0 && (
        <div role="radiogroup" aria-label={t('install.hosts')} className="grid grid-cols-3 gap-2">
          {hosts.map((item) => {
            const on = item.slug === picked?.slug
            return (
              <button
                key={item.slug}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setHost(item.slug)
                  setCopied(false)
                }}
                className={`flex min-w-0 flex-col items-center gap-1.5 rounded-tile border bg-bg px-1.5 py-2.5 text-small transition-colors ${on ? 'border-ink font-medium text-ink' : 'border-surface-2 text-ink-2 hover:border-line'}`}
              >
                {item.logo ? (
                  <Image src={item.logo} alt="" width={28} height={28} unoptimized className="size-7 rounded-thumb object-contain" />
                ) : (
                  <InitialTile label={hostInitials(item.name)} tone={toneFor(item.slug)} size="sm" />
                )}
                <span className="max-w-full truncate">{item.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {picked && (
        <p className="text-meta text-ink-3">
          {t('install.compatLine', { host: picked.name, status: t(`compat.${picked.compat}`) })}
          {picked.compatNote && ` · ${picked.compatNote}`}
        </p>
      )}

      {disabled ? (
        <p role="status" className="flex items-start gap-2 rounded-thumb bg-bg px-3 py-2.5 text-ui text-ink-2">
          <Icon name="alert" size={18} />
          {disabled}
        </p>
      ) : (
        <p className="rounded-thumb border border-line bg-bg px-3 py-2.5 font-mono text-meta wrap-anywhere text-ink">{instruction}</p>
      )}

      <button
        type="button"
        onClick={copy}
        disabled={Boolean(disabled) || !instruction}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-btn bg-ink px-4 text-ui font-medium text-white transition-colors hover:bg-ink-2 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-4"
      >
        <Icon name={copied ? 'check' : 'copy'} size={16} />
        {copied ? t('install.copied') : t('install.copy')}
      </button>
      <span role="status" className="sr-only">
        {copied ? t('install.copied') : ''}
      </span>
      {disabled ? (
        <span aria-disabled="true" className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-1.5 rounded-btn border border-surface-2 px-4 text-ui font-medium text-ink-4">
          <Icon name="download" size={16} />
          {t('install.download')}
        </span>
      ) : (
        // A plain link: nothing prefetches it, and only a real click counts as a download.
        <a
          href={`${zipHref}?host=${encodeURIComponent(picked?.slug ?? '')}`}
          rel="nofollow"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-btn border border-line bg-bg px-4 text-ui font-medium text-ink transition-colors hover:border-ink-4"
        >
          <Icon name="download" size={16} />
          {t('install.download')}
        </a>
      )}
      <p className="text-small text-ink-4">{t('install.hint')}</p>
    </section>
  )
}

/** "Claude Code" → "CC", "Codex" → "Co", "Pi" → "Pi". */
function hostInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) return words.map((word) => Array.from(word)[0] ?? '').join('').slice(0, 2).toUpperCase()
  const letters = Array.from(name.trim())
  return `${letters[0]?.toUpperCase() ?? '?'}${letters[1] ?? ''}`
}
