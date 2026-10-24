'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { Icon } from '@/components/icon'
import { Link, useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'

/** Sign-in link for visitors; initial + small menu for signed-in users. Reads the session on the client so pages stay static. */
export function AccountButton() {
  const t = useTranslations('header')
  const { data: session } = authClient.useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const user = session?.user
  if (!user) {
    return (
      <Link
        href="/sign-in"
        aria-label={t('signIn')}
        className="flex size-11 items-center justify-center text-ink transition-colors hover:text-accent"
      >
        <Icon name="user" size={20} />
      </Link>
    )
  }

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase()

  async function signOut() {
    setOpen(false)
    await authClient.signOut()
    router.refresh()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('account')}
        onClick={() => setOpen((value) => !value)}
        className="flex size-11 items-center justify-center"
      >
        <span className="flex size-8 items-center justify-center rounded-pill bg-ink text-meta font-semibold text-white">
          {initial}
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-12 z-30 flex w-60 flex-col gap-1 rounded-tile bg-bg p-1.5 shadow-float"
        >
          <p className="truncate px-2.5 py-2 text-meta text-ink-4">{user.email}</p>
          <Link
            href="/me/saves"
            onClick={() => setOpen(false)}
            className="flex h-10 items-center rounded-thumb px-2.5 text-ui text-ink hover:bg-surface"
          >
            {t('saves')}
          </Link>
          <Link
            href="/me/account"
            onClick={() => setOpen(false)}
            className="flex h-10 items-center rounded-thumb px-2.5 text-ui text-ink hover:bg-surface"
          >
            {t('accountPage')}
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex h-10 items-center rounded-thumb px-2.5 text-left text-ui text-ink hover:bg-surface"
          >
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
