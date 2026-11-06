import { afterEach, expect, test, vi } from 'vitest'
import { thisWeek } from './weeks'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test('"This week" follows the local calendar day, not the UTC one', () => {
  vi.stubEnv('TZ', 'Europe/Tallinn')
  // Monday 5 January 2026 at 01:30 in Tallinn, which is still Sunday in UTC.
  vi.useFakeTimers({ now: new Date('2026-01-04T23:30:00Z'), toFake: ['Date'] })

  expect(thisWeek({ from: '2025-12-29', to: '2026-01-18' })).toEqual({
    from: '2026-01-05',
    to: '2026-01-25',
  })
})
