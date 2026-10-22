'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type ShareButtonProps = {
  /** Shown in the share sheet next to the link. */
  title: string
  className: string
}

/** Opens the system share sheet where there is one; elsewhere copies the page's address. */
export function ShareButton({ title, className }: ShareButtonProps) {
  const t = useTranslations('apps')
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
        {copied ? t('copied') : t('share')}
      </button>
      <span role="status" className="sr-only">
        {copied ? t('copied') : ''}
      </span>
    </>
  )
}
