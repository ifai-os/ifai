import type { BrandLogo } from '../../brand-logos'

/** Brand colours too dark to see on the dark theme: drawn in the text colour instead. */
function isDark(hex: string): boolean {
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2
}

/** A company's or product's logo (../../brand-logos.ts), decorative: the name is written next to it. */
export function BrandMark({ logo, className }: { logo: BrandLogo; className?: string }) {
  const dark = isDark(logo.hex)
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${dark ? 'text-ink' : ''} ${className ?? ''}`}
      fill={dark ? 'currentColor' : `#${logo.hex}`}
    >
      <path d={logo.path} />
    </svg>
  )
}
