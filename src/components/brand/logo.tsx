import Image from 'next/image'

type LogoProps = {
  size?: number
  /** Dark tile for dark backgrounds. */
  tone?: 'light' | 'dark'
  /** Load immediately (above the fold, e.g. the header). */
  eager?: boolean
}

/** The final IFAI icon (person "i" + robot "f"). Decorative: pair it with visible text or an aria-label. */
export function Logo({ size = 32, tone = 'light', eager = false }: LogoProps) {
  return (
    <Image
      src={tone === 'dark' ? '/brand/ifai-icon-dark.svg' : '/brand/ifai-icon.svg'}
      alt=""
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      unoptimized
      className="block flex-none"
    />
  )
}
