import { Temporal } from 'temporal-polyfill'

// Days travel as YYYY-MM-DD strings, the form the API uses, and every calculation goes
// through Temporal.PlainDate: it holds no time and no zone, so neither DST nor the
// viewer's offset can move a day.
const { PlainDate } = Temporal

export type DateRange = { from: string; to: string }

// Mirrors maxWeeks in api/capacity.go: two years, widened to whole weeks.
export const MAX_WEEKS = 106

const DAY_AND_MONTH = { day: 'numeric', month: 'short' } as const
const DAY_MONTH_AND_YEAR = { ...DAY_AND_MONTH, year: 'numeric' } as const

// A date field can hold a year past 9999, which PlainDate cannot read in this form.
export const isDay = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text)

export const isBefore = (day: string, other: string) => PlainDate.compare(day, other) < 0

const mondayOf = (day: Temporal.PlainDate) => day.subtract({ days: day.dayOfWeek - 1 })

// Widens a range to whole Monday-to-Sunday weeks, as the API does.
export function wholeWeeks({ from, to }: DateRange): DateRange {
  return {
    from: mondayOf(PlainDate.from(from)).toString(),
    to: mondayOf(PlainDate.from(to)).add({ days: 6 }).toString(),
  }
}

export function weekCount(range: DateRange) {
  const { from, to } = wholeWeeks(range)
  return (PlainDate.from(from).until(to).days + 1) / 7
}

// The same number of weeks, starting on the viewer's current week. This reads the viewer's
// own calendar: the UTC day would still be Sunday at Monday 01:30 in Tallinn.
export function thisWeek(range: DateRange): DateRange {
  const monday = mondayOf(Temporal.Now.plainDateISO())
  const nextRange = monday.add({ weeks: weekCount(range) })
  return { from: monday.toString(), to: nextRange.subtract({ days: 1 }).toString() }
}

export function shiftWeeks({ from, to }: DateRange, weeks: number): DateRange {
  return {
    from: PlainDate.from(from).add({ weeks }).toString(),
    to: PlainDate.from(to).add({ weeks }).toString(),
  }
}

export const formatDay = (day: string) => PlainDate.from(day).toLocaleString('en-GB', DAY_AND_MONTH)

export const formatDayWithYear = (day: string) =>
  PlainDate.from(day).toLocaleString('en-GB', DAY_MONTH_AND_YEAR)

export const yearOf = (day: string) => PlainDate.from(day).year
