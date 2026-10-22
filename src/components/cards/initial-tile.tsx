/** Seven tile tones from the design tokens. Class names are literal so Tailwind can see them. */
const tones = [
  'bg-tile-1 text-tile-1-ink',
  'bg-tile-2 text-tile-2-ink',
  'bg-tile-3 text-tile-3-ink',
  'bg-tile-4 text-tile-4-ink',
  'bg-tile-5 text-tile-5-ink',
  'bg-tile-6 text-tile-6-ink',
  'bg-tile-7 text-tile-7-ink',
] as const

const sizes = {
  sm: 'size-7 rounded-thumb text-small',
  md: 'size-10 rounded-tile text-body',
  lg: 'size-11 rounded-tile text-body',
  xl: 'size-13 rounded-tile text-h3',
} as const

export type TileSize = keyof typeof sizes

/** Stable tone for an id or slug, so the same app always gets the same color. */
export function toneFor(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return hash % tones.length
}

type InitialTileProps = {
  label: string
  /** 0–6; defaults to a tone derived from the label. */
  tone?: number
  size?: TileSize
}

/** Placeholder icon for apps and skills that have no logo yet. */
export function InitialTile({ label, tone, size = 'md' }: InitialTileProps) {
  const index = (tone ?? toneFor(label)) % tones.length
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center font-bold ${sizes[size]} ${tones[index]}`}
    >
      {label}
    </span>
  )
}
