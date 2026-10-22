import type { Payload } from 'payload'

export type PublishedApp = {
  id: number
  name: string
  aliases: string[]
  developer: string | null
  domain: string | null
  website: string | null
  categoryId: number | null
}

/** Every published app with what heat and mention matching need. */
export async function loadPublishedApps(payload: Payload): Promise<PublishedApp[]> {
  const { docs } = await payload.find({
    collection: 'apps',
    where: { status: { equals: 'published' } },
    pagination: false,
    depth: 0,
    select: { name: true, aliases: true, developer: true, domain: true, website: true, primaryCategory: true },
  })
  return docs.map((doc) => ({
    id: doc.id,
    name: doc.name,
    aliases: doc.aliases ?? [],
    developer: doc.developer || null,
    domain: doc.domain || null,
    website: doc.website || null,
    categoryId: typeof doc.primaryCategory === 'object' ? (doc.primaryCategory?.id ?? null) : (doc.primaryCategory ?? null),
  }))
}
