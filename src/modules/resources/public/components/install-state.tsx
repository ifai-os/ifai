'use client'

import { useTranslations } from 'next-intl'
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'

import { Icon } from '@/components/icon'

import type { HostOption } from '../data'

type InstallState = {
  hosts: HostOption[]
  /** The host picked in the install panel (the first one until the reader picks). */
  picked: HostOption | undefined
  pick: (slug: string) => void
  /** The sentence to copy for the picked host; empty when there is none. */
  instruction: string
  zipHref: string
  /** Null when this version installs; otherwise why the buttons are off. */
  disabled: string | null
  copied: boolean
  copy: () => Promise<void>
}

const InstallContext = createContext<InstallState | null>(null)

export function useInstall(): InstallState {
  const value = use(InstallContext)
  if (!value) throw new Error('useInstall needs an InstallProvider around it')
  return value
}

type InstallProviderProps = {
  slug: string
  version: string
  hosts: HostOption[]
  /** The sentence to copy for each host, in the reader's language, keyed by host slug. */
  instructions: Record<string, string>
  zipHref: string
  disabled: string | null
  children: ReactNode
}

/**
 * The install panel's state, shared with the copy button in the phone's bottom bar, so both copy
 * the sentence for the host picked in the panel. Copying is counted as an install here; the
 * download is counted by the Zip route.
 */
export function InstallProvider({ slug, version, hosts, instructions, zipHref, disabled, children }: InstallProviderProps) {
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

  const pick = useCallback((slug: string) => {
    setHost(slug)
    setCopied(false)
  }, [])

  const copy = useCallback(async () => {
    if (disabled || !instruction) return
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
  }, [disabled, instruction, picked, slug, version])

  return (
    <InstallContext value={{ hosts, picked, pick, instruction, zipHref, disabled, copied, copy }}>
      {children}
      {/* One announcement, whichever copy button was pressed. */}
      <span role="status" className="sr-only">
        {copied ? t('install.copied') : ''}
      </span>
    </InstallContext>
  )
}

/** 「复制安装指令」: in the install panel, and in the phone's bottom bar. */
export function CopyInstallButton({ className }: { className: string }) {
  const t = useTranslations('resources')
  const { instruction, disabled, copied, copy } = useInstall()
  return (
    <button type="button" onClick={copy} disabled={Boolean(disabled) || !instruction} className={className}>
      <Icon name={copied ? 'check' : 'copy'} size={16} />
      {copied ? t('install.copied') : t('install.copy')}
    </button>
  )
}
