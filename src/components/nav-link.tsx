'use client'

import type { ReactNode } from 'react'

import { Icon, type IconName } from '@/components/icon'
import { Link, usePathname } from '@/i18n/navigation'

type NavLinkProps = {
  href: `/${string}`
  icon: IconName
  children: ReactNode
}

export function NavLink({ href, icon, children }: NavLinkProps) {
  const pathname = usePathname()
  const current = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-ink transition-colors hover:text-accent ${current ? 'font-medium' : ''}`}
    >
      <Icon name={icon} size={18} />
      {children}
    </Link>
  )
}
