'use client'

import { useEffect, useState } from 'react'

import { Icon } from '@/components/icon'

type ShareButtonProps = {
  /** Shown in the share sheet next to the link. */
  title: string
  className: string
  /** The button's text, and what it says for two seconds after copying the link. */
  labels: { share: string; copied: string }
  /** Show an icon (a tick once copied) instead of the text, which stays for screen readers. */
  iconOnly?: boolean
  iconSize?: number
  /** What to share, when it is not this page: an address on this site such as "/en/circles/p/45". */
  url?: string
}

/** Opens the system share sheet where there is one; elsewhere copies the page's address (or `url`). */
export function ShareButton({ title, className, labels, iconOnly = false, iconSize = 20, url: path }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function share() {
    const url = path ? new URL(path, window.location.origin).href : window.location.href
    if (typeof navigator.share === 'function') {
      // Closing the sheet without sharing rejects; there is nothing to tell the reader.
      await navigator.share({ title, url }).catch(() => {})
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // No clipboard access (an old browser, a denied permission): the address bar still has the link.
    }
  }

  return (
    <>
      <button type="button" onClick={share} className={className}>
        {iconOnly ? (
          <>
            <Icon name={copied ? 'check' : 'share'} size={iconSize} />
            <span className="sr-only">{labels.share}</span>
          </>
        ) : copied ? (
          labels.copied
        ) : (
          labels.share
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? labels.copied : ''}
      </span>
    </>
  )
}
