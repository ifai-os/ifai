/**
 * 「登录的设备」(docs/specs/account.md): what a sign-in's browser identification says about the
 * device, as「Mac · Chrome」. Only the common systems and browsers; anything else is unknown
 * rather than guessed. No server imports, so the settings page's own code can use it.
 */
export type Device = {
  system: string | null
  browser: string | null
  /** A phone or tablet, for the row's icon. */
  handheld: boolean
}

// First match wins: iPads and Android tablets before desktops, ChromeOS before Linux.
const systems: [RegExp, string, boolean][] = [
  [/iPhone|iPod/, 'iPhone', true],
  [/iPad/, 'iPad', true],
  [/Android/, 'Android', true],
  [/CrOS/, 'ChromeOS', false],
  [/Macintosh|Mac OS X/, 'Mac', false],
  [/Windows/, 'Windows', false],
  [/Linux/, 'Linux', false],
]

// Edge, Opera and Samsung Internet also say Chrome, and every iOS browser says Safari: those go first.
const browsers: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
]

export function describeDevice(userAgent: string | null | undefined): Device {
  const ua = userAgent ?? ''
  const system = systems.find(([pattern]) => pattern.test(ua))
  const browser = browsers.find(([pattern]) => pattern.test(ua))
  return { system: system?.[1] ?? null, browser: browser?.[1] ?? null, handheld: system?.[2] ?? false }
}

/** 「Mac · Chrome」, either half alone when only one is known; null when neither is. Names are not translated. */
export function deviceLabel(device: Device): string | null {
  const parts = [device.system, device.browser].filter((part): part is string => part !== null)
  return parts.length ? parts.join(' · ') : null
}
