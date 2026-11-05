/**
 * Takes the sample stories (scripts/seed-stories.ts, slugs starting `sample-`) off a preview's pages
 * before launch checks (站长, 2026-11-05): they are set to「已撤回」(withdrawn), not deleted, so
 * running Seed preview again brings them back. Writes only where the seed may write (./seed-target.ts);
 * .github/workflows/seed-main-preview.yml runs it when asked to withdraw.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { assertSeedTarget } from './seed-target'

assertSeedTarget('withdrawn sample stories')
const payload = await getPayload({ config })

const { docs } = await payload.find({
  collection: 'stories',
  where: { and: [{ slug: { like: 'sample-' } }, { status: { not_equals: 'withdrawn' } }] },
  pagination: false,
  depth: 0,
  select: { slug: true, status: true },
})
const samples = docs.filter((doc) => doc.slug?.startsWith('sample-'))
for (const doc of samples) {
  await payload.update({ collection: 'stories', id: doc.id, data: { status: 'withdrawn' }, depth: 0 })
  console.log(`Withdrew ${doc.slug} (was ${doc.status}).`)
}
console.log(samples.length ? `Withdrew ${samples.length} sample stories.` : 'No sample stories to withdraw.')
process.exit(0)
