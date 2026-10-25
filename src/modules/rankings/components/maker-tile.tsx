import { InitialTile, tileTones, toneFor, type TileSize } from '@/components/cards/initial-tile'
import { initialOf } from '@/modules/apps/localized'

/** The maker's initial in the maker's tone, so one maker's models look alike. Decorative: the names sit next to it. */
export function MakerTile({ org, size = 'sm' }: { org: string; size?: TileSize }) {
  return <InitialTile label={initialOf(org)} tone={toneFor(org)} size={size} />
}

/** The same, small enough to sit inside a bar of「前 10」. */
export function MakerDot({ org }: { org: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-4.5 flex-none items-center justify-center rounded-tag text-micro font-bold ${tileTones[toneFor(org)]}`}
    >
      {initialOf(org)}
    </span>
  )
}
