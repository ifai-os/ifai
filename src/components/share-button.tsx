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
}

/** Opens the system share sheet where there is one; elsewhere copies the page's address. */
export function ShareButton({ title, className, labels, iconOnly = false }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function share() {
    const url = window.location.href
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
            <Icon name={copied ? 'check' : 'share'} size={20} />
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
