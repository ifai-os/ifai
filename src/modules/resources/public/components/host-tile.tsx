import Image from 'next/image'

import { InitialTile, toneFor } from '@/components/cards/initial-tile'

/** An assistant's logo, or its initials until the official logo is in (docs/status.md). */
export function HostTile({ name, slug, logo }: { name: string; slug: string; logo: string | null }) {
  if (logo) return <Image src={logo} alt="" width={28} height={28} unoptimized className="size-7 rounded-thumb object-contain" />
  return <InitialTile label={hostInitials(name)} tone={toneFor(slug)} size="sm" />
}

/** "Claude Code" → "CC", "Codex" → "Co", "Pi" → "Pi". */
function hostInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) return words.map((word) => Array.from(word)[0] ?? '').join('').slice(0, 2).toUpperCase()
  const letters = Array.from(name.trim())
  return `${letters[0]?.toUpperCase() ?? '?'}${letters[1] ?? ''}`
}
