'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { MemberAvatar, memberName } from '@/components/account/member-avatar'
import { Icon, type IconName } from '@/components/icon'
import { ThemePicker } from '@/components/theme-picker'
import { isLaunched } from '@/config/site'
import { Link, useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'

/**
 * Sign-in link for visitors; for members, their avatar and the account menu of「IFAI 账号菜单与通知」
 * (docs/specs/account.md): who they are, their saves and submissions, settings and signing out.
 * Reads the session on the client so pages stay static.
 */
export function AccountButton() {
  const t = useTranslations('header')
  const { data: session } = authClient.useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [appearance, setAppearance] = useState(false)
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
        className="flex size-11 items-center justify-center text-ink transition-colors hover:text-accent-ink"
      >
        <Icon name="user" size={20} />
      </Link>
    )
  }

  const name = memberName(user)
  const close = () => setOpen(false)

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
        onClick={() => {
          setOpen((value) => !value)
          setAppearance(false)
        }}
        className="flex size-11 items-center justify-center"
      >
        <MemberAvatar userId={user.id} name={name} size="sm" />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute top-12 right-0 z-30 flex w-75 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card border border-hairline bg-overlay shadow-float"
        >
          <Link href="/me/account" onClick={close} className="flex items-center gap-3 px-5 py-4.5 text-ink hover:bg-surface">
            <MemberAvatar userId={user.id} name={name} size="md" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-body font-semibold">{name}</span>
              <span className="truncate text-small text-ink-4">{user.email}</span>
            </span>
            <span className="text-ink-4">
              <Icon name="chevronRight" size={18} />
            </span>
          </Link>
          <div className="h-px bg-surface-2" />
          <nav aria-label={t('mine')} className="flex flex-col px-2 py-1.5">
            <MenuLink href="/me/saves" icon="bookmark" label={t('saves')} onClick={close} />
            <MenuLink href="/me/following" icon="hash" label={t('following')} onClick={close} />
            {isLaunched('recommend') && <MenuLink href="/me/articles" icon="file" label={t('articles')} onClick={close} />}
            <MenuLink href="/apps/submit#mine" icon="upload" label={t('submissions')} onClick={close} />
          </nav>
          <div className="h-px bg-surface-2" />
          {appearance && <ThemePicker className="mx-4 mt-3" />}
          <div className="flex px-2 pt-0.5 pb-1">
            <button type="button" aria-expanded={appearance} onClick={() => setAppearance((value) => !value)} className={footerItem}>
              <Icon name="appearance" size={22} />
              {t('appearance')}
            </button>
            <Link href="/me/account" onClick={close} className={footerItem}>
              <Icon name="settings" size={22} />
              {t('accountPage')}
            </Link>
            <button type="button" onClick={signOut} className={footerItem}>
              <Icon name="signOut" size={22} />
              {t('signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const footerItem =
  'flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-tile px-1 pt-3.5 pb-3 text-center text-meta text-ink-2 hover:bg-surface hover:text-ink'

function MenuLink({ href, icon, label, onClick }: { href: `/${string}`; icon: IconName; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex h-12 items-center gap-3.5 rounded-tile px-3 text-body text-ink hover:bg-surface">
      <Icon name={icon} size={22} />
      {label}
    </Link>
  )
}
