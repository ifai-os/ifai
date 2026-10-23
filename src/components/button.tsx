import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Link } from '@/i18n/navigation'

/** Buttons from the「设计令牌」board: primary is black (one per screen), secondary is outlined. */
const variants = {
  primary: 'bg-ink text-white hover:bg-ink-2',
  secondary: 'border border-line bg-bg text-ink hover:border-ink-4',
} as const

export type ButtonVariant = keyof typeof variants

/** Size and shape without colors, for buttons that color themselves (a save button turns red once saved). */
export const buttonBase =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-btn px-4 text-ui font-medium whitespace-nowrap transition-colors'

export function buttonClass(variant: ButtonVariant = 'primary', className?: string): string {
  return [buttonBase, variants[variant], className].filter(Boolean).join(' ')
}

type ButtonLinkProps = {
  href: `/${string}`
  variant?: ButtonVariant
  className?: string
  children: ReactNode
}

/** A link that looks like a button; keeps the locale prefix. */
export function ButtonLink({ href, variant, className, children }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }

export function Button({ variant, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />
}
