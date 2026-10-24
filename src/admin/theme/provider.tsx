import type { ReactNode } from 'react'

import './admin.css'

/** Wraps the whole back office so its stylesheet (the site's buttons) loads on every admin page. */
export function AdminTheme({ children }: { children?: ReactNode }) {
  return <>{children}</>
}
