'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { InitialTile, toneFor } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'

import { copyButtonClass } from './classes'
import { CopyInstallButton, useInstall } from './install-state'

type InstallPanelProps = {
  /** A newer version that is still being checked or did not pass. */
  pending: string | null
}

/**
 * The install panel (docs/specs/resources.md「页面与路由」, rule 7): pick a host, then copy the
 * sentence that sends the reader's assistant to install.md, or download the Zip. Its state lives
 * in the InstallProvider around the page, which the phone's bottom bar shares.
 */
export function InstallPanel({ pending }: InstallPanelProps) {
  const t = useTranslations('resources')
  const { hosts, picked, pick, instruction, zipHref, disabled } = useInstall()

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
                onClick={() => pick(item.slug)}
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

      <CopyInstallButton className={`h-11 text-ui ${copyButtonClass}`} />
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
