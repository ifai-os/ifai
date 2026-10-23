import { InitialTile, toneFor, type TileSize } from '@/components/cards/initial-tile'
import { initialOf } from '@/modules/apps/localized'

/** The initial-letter tile for a Skill; Skills have no logos of their own. Decorative: the name sits next to it. */
export function SkillTile({ name, slug, size = 'md' }: { name: string; slug: string; size?: TileSize }) {
  return <InitialTile label={initialOf(name)} tone={toneFor(slug)} size={size} />
}
