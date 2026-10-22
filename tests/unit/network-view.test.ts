import { describe, expect, it } from 'vitest'

import { networkView } from '@/components/states/network-view'

describe('networkView', () => {
  it('stays out of the way while online', () => {
    expect(networkView(true, 'idle')).toBe('hidden')
  })

  it('offers a retry when the browser goes offline', () => {
    expect(networkView(false, 'idle')).toBe('offline')
  })

  it('shows the retry spinning and the recovery notice regardless of the flag', () => {
    expect(networkView(false, 'reconnecting')).toBe('reconnecting')
    expect(networkView(true, 'reconnecting')).toBe('reconnecting')
    expect(networkView(true, 'restored')).toBe('restored')
  })
})
