import { afterEach, expect, test, vi } from 'vitest'
import { shiftWeeks, thisWeek, wholeWeeks } from './weeks'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test('weeks run Monday to Sunday on the local calendar, not the UTC one', () => {
  vi.stubEnv('TZ', 'Europe/Tallinn')
  // Monday 5 January 2026 at 01:30 in Tallinn, which is still Sunday in UTC.
  vi.useFakeTimers({ now: new Date('2026-01-04T23:30:00Z'), toFake: ['Date'] })

  const range = thisWeek({ from: '2025-12-29', to: '2026-01-18' })
  expect(range).toEqual({ from: '2026-01-05', to: '2026-01-25' })

  // A Sunday closes its week, and moving across a new year keeps whole weeks.
  expect(wholeWeeks({ from: '2026-01-04', to: '2026-01-05' })).toEqual({
    from: '2025-12-29',
    to: '2026-01-11',
  })
  expect(shiftWeeks(range, -1)).toEqual({ from: '2025-12-29', to: '2026-01-18' })
})
