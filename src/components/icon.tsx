import type { ReactNode, SVGProps } from 'react'

/** Line icons on a 24×24 grid with round caps (1.8 stroke by default; the nav uses 2). */
const icons = {
  // Module icons (nav, coming-soon cards): rounded, a little playful, after
  // sspai's nav. Drawn to fill the 24 grid so they read at text height.
  recommend: (
    <>
      <path d="M11 3.5c.7 4.1 2.4 5.8 6.5 6.5-4.1.7-5.8 2.4-6.5 6.5-.7-4.1-2.4-5.8-6.5-6.5 4.1-.7 5.8-2.4 6.5-6.5z" />
      <path d="M18.5 15.5v5M16 18h5" />
    </>
  ),
  circles: (
    <>
      <path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.8s-3.8 7.7-8.5 7.7c-1.2 0-2.3-.2-3.3-.6L4 20l1.2-3.9a7.4 7.4 0 0 1-1.7-4.8c0-4.4 3.8-7.8 8.5-7.8z" />
      <path d="M9 11.5c1.6 1.8 4.4 1.8 6 0" />
    </>
  ),
  daily: (
    <>
      <path d="M3.5 6.5a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v14h-10a3 3 0 0 1-3-3z" />
      <path d="M16.5 9h2a2 2 0 0 1 2 2v6.5a3 3 0 0 1-3 3h-1M7.5 8.5h5M7.5 12.5h5M7.5 16.5h2.5" />
    </>
  ),
  apps: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      <circle cx="17" cy="7" r="3.5" />
    </>
  ),
  rankings: (
    <>
      <rect x="3.5" y="11.5" width="5" height="9" rx="1.5" />
      <rect x="9.5" y="3.5" width="5" height="17" rx="1.5" />
      <rect x="15.5" y="8.5" width="5" height="12" rx="1.5" />
    </>
  ),
  // A package: Skills install as one.
  resources: (
    <>
      <path d="M10.5 3.4a3 3 0 0 1 3 0l5.5 3.2a3 3 0 0 1 1.5 2.6v5.6a3 3 0 0 1-1.5 2.6l-5.5 3.2a3 3 0 0 1-3 0L5 17.4a3 3 0 0 1-1.5-2.6V9.2A3 3 0 0 1 5 6.6z" />
      <path d="M4 7.8 12 12.3l8-4.5M12 12.3v8.7" />
    </>
  ),
  wiki: (
    <>
      <path d="M4.5 18V6.5a3 3 0 0 1 3-3h12v13h-12a3 3 0 0 0-3 3 2 2 0 0 0 2 2h13" />
      <path d="M9 8h6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5c1.3-2 3.2-3 5.5-3s4.2 1 5.5 3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  // Filled with currentColor once saved.
  bookmark: <path d="M6 4h12v16l-6-4-6 4z" />,
  // 「我的关注」in the account menu: what you follow shows as #name, like the topic pages.
  hash: <path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h15M4 15h15" />,
  // The account menu (「IFAI 账号菜单与通知」) and「登录的设备」(「IFAI 账号设置」).
  chevronRight: <path d="M9 6l6 6-6 6" />,
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  appearance: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </>
  ),
  signOut: (
    <>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  computer: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  message: <path d="M4 5h16v11H9l-5 4z" />,
  // The「机器翻译」mark.
  translate: (
    <>
      <path d="M4 5h8M8 3v2M10 5c-.8 4-3 7-6 9M6 9c1.2 2.4 3.2 4.2 6 5.5" />
      <path d="m13 21 4-9 4 9M14.5 18h5" />
    </>
  ),
  share: (
    <>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  inbox: (
    <>
      <path d="M4 13l2.5-7h11L20 13v6H4z" />
      <path d="M4 13h5l1.5 2.5h3L15 13h5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  offline: <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  verified: (
    <>
      <path d="M12 3l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.7 1 2.7-2.4 1.8-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9-2.4-1.8 1-2.7-1-2.7 2.4-1.8.9-2.9 3 .2z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof icons

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
      {...rest}
    >
      {icons[name]}
    </svg>
  )
}
