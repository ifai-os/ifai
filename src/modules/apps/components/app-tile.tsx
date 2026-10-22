import Image from 'next/image'

import { InitialTile, tileSizes, toneFor, type TileSize } from '@/components/cards/initial-tile'

import type { AppImage } from '../data'
import { initialOf } from '../localized'

type AppTileProps = {
  name: string
  slug: string
  logo: AppImage | null
  size?: TileSize
}

/** The app's own icon, or its initial-letter tile. Decorative: the name always sits next to it. */
export function AppTile({ name, slug, logo, size = 'lg' }: AppTileProps) {
  if (!logo) return <InitialTile label={initialOf(name)} tone={toneFor(slug)} size={size} />

  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center overflow-hidden border border-surface-2 bg-bg ${tileSizes[size]}`}
    >
      {/* Logos are small and may be SVG or ICO, so they are not resized. */}
      <Image
        src={logo.url}
        alt=""
        width={logo.width ?? 128}
        height={logo.height ?? 128}
        unoptimized
        className="size-full object-contain"
      />
    </span>
  )
}
