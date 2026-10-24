import type { ReactNode, SVGProps } from 'react'

/** Line icons from the design canvas: 24×24 grid, 1.8 stroke, round caps. */
const icons = {
  recommend: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16v4M17 18h4" />
    </>
  ),
  circles: (
    <>
      <circle cx="9" cy="10" r="6" />
      <circle cx="15" cy="14" r="6" />
    </>
  ),
  daily: (
    <>
      <path d="M4 19V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 0 1 1H5a1 1 0 0 1-1-1z" />
      <path d="M18 8h2v11a1 1 0 0 1-1 1M8 8h6M8 12h6M8 16h4" />
    </>
  ),
  apps: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  rankings: <path d="M6 20V10M12 20V4M18 20v-7" />,
  resources: (
    <>
      <path d="M3 7l9-4 9 4-9 4z" />
      <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
    </>
  ),
  wiki: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21a2 2 0 0 1 2-2h13v2M9 7h6" />
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
  message: <path d="M4 5h16v11H9l-5 4z" />,
  // The「机器翻译」mark.
  translate: (
    <>
      <path d="M4 5h8M8 3v2M10 5c-.8 4-3 7-6 9M6 9c1.2 2.4 3.2 4.2 6 5.5" />
      <path d="m13 21 4-9 4 9M14.5 18h5" />
    </>
  ),
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />,
  reaction: (
    <>
      <path d="M18.73 10.93A8 8 0 1 1 13.07 5.27" />
      <path d="M8 15.5c.9 1.1 1.9 1.6 3 1.6s2.1-.5 3-1.6" />
      <path d="M8.5 11.2h.01M13.5 11.2h.01" strokeWidth={2.4} />
      <path d="M19 2.5v5M16.5 5h5" />
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
