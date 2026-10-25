import { createNavigation } from 'next-intl/navigation'

import { routing } from './routing'

// Use these instead of next/link and next/navigation so links keep the locale prefix.
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } = createNavigation(routing)
