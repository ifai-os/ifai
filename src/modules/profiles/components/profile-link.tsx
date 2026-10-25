import type { ReactNode } from 'react'

import { Link } from '@/i18n/navigation'

import { profilePath } from '../rules'

type ProfileLinkProps = {
  /** Their page address; without one, just what is inside. */
  handle: string | null
  className?: string
  /**
   * A second link to the same page right beside the first, like the picture next to the name:
   * left out of the tab order and of what screen readers read, which the name already gives.
   */
  twin?: boolean
  children: ReactNode
}

/** To a member's page (docs/specs/circles.md「/u/[handle]」). */
export function ProfileLink({ handle, className, twin = false, children }: ProfileLinkProps) {
  if (!handle) return <span className={className}>{children}</span>
  return (
    <Link href={profilePath(handle)} className={className} {...(twin && { tabIndex: -1, 'aria-hidden': true })}>
      {children}
    </Link>
  )
}
