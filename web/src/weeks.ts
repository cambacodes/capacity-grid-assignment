// Calendar days are plain YYYY-MM-DD strings, the same form the API uses.
// Arithmetic goes through UTC so neither DST nor the viewer's offset can move a day.

export type DateRange = { from: string; to: string }

// Mirrors maxWeeks in api/capacity.go: two years, widened to whole weeks.
export const MAX_WEEKS = 106

const DAY_MS = 86_400_000

const toDate = (day: string) => new Date(`${day}T00:00:00Z`)

export function addDays(day: string, days: number) {
  return new Date(toDate(day).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

export function mondayOf(day: string) {
  return addDays(day, -((toDate(day).getUTCDay() + 6) % 7))
}

// Widens a range to whole Monday-to-Sunday weeks, as the API does.
export function wholeWeeks({ from, to }: DateRange): DateRange {
  return { from: mondayOf(from), to: addDays(mondayOf(to), 6) }
}

export function weekCount(range: DateRange) {
  const { from, to } = wholeWeeks(range)
  return (toDate(to).getTime() - toDate(from).getTime() + DAY_MS) / (7 * DAY_MS)
}

// The viewer's own calendar day. toISOString() would give the UTC day instead,
// which is still Sunday at Monday 01:30 in Tallinn.
export function localDay(now: Date) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// The same number of weeks, starting on the week of `now`.
export function thisWeek(range: DateRange, now: Date): DateRange {
  const from = mondayOf(localDay(now))
  return { from, to: addDays(from, weekCount(range) * 7 - 1) }
}

export function shiftWeeks({ from, to }: DateRange, weeks: number): DateRange {
  return { from: addDays(from, weeks * 7), to: addDays(to, weeks * 7) }
}

const dayAndMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

export function formatDay(day: string) {
  return dayAndMonth.format(toDate(day))
}
