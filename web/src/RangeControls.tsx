import { type ChangeEvent, useState } from 'react'
import {
  MAX_WEEKS,
  type DateRange,
  formatDay,
  shiftWeeks,
  thisWeek,
  weekCount,
  wholeWeeks,
} from './weeks'

type Props = {
  range: DateRange
  onChange: (range: DateRange) => void
}

const formatDayWithYear = (day: string) => `${formatDay(day)} ${day.slice(0, 4)}`

function rangeProblem({ from, to }: DateRange) {
  if (!from || !to) return 'Enter both dates.'
  if (to < from) return 'The end date is before the start date.'
  if (weekCount({ from, to }) > MAX_WEEKS) return `The limit is ${MAX_WEEKS} weeks.`
  return null
}

// Moves the range by week and picks it by date. What the manager types stays in the
// fields until they leave them, so a date is not rewritten to its Monday mid-typing.
export function RangeControls({ range, onChange }: Props) {
  const [typed, setTyped] = useState<DateRange | null>(null)
  const shown = typed ?? range
  const problem = rangeProblem(shown)

  function applyTyped(next: DateRange) {
    setTyped(next)
    if (!rangeProblem(next)) onChange(wholeWeeks(next))
  }

  function applyMove(next: DateRange) {
    setTyped(null)
    onChange(next)
  }

  function handlePrevious() {
    applyMove(shiftWeeks(range, -1))
  }

  function handleThisWeek() {
    applyMove(thisWeek(range, new Date()))
  }

  function handleNext() {
    applyMove(shiftWeeks(range, 1))
  }

  function handleFrom(event: ChangeEvent<HTMLInputElement>) {
    applyTyped({ ...shown, from: event.target.value })
  }

  function handleTo(event: ChangeEvent<HTMLInputElement>) {
    applyTyped({ ...shown, to: event.target.value })
  }

  function handleBlur() {
    if (!problem) setTyped(null)
  }

  const weeks = weekCount(range)

  return (
    <div className="range">
      <button type="button" aria-label="Previous week" onClick={handlePrevious}>
        ←
      </button>
      <button type="button" onClick={handleThisWeek}>
        This week
      </button>
      <button type="button" aria-label="Next week" onClick={handleNext}>
        →
      </button>
      <label>
        From
        <input
          type="date"
          value={shown.from}
          aria-invalid={problem !== null}
          onChange={handleFrom}
          onBlur={handleBlur}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={shown.to}
          aria-invalid={problem !== null}
          onChange={handleTo}
          onBlur={handleBlur}
        />
      </label>
      {problem ? (
        <p className="range-note range-problem" role="alert">
          {problem}
        </p>
      ) : (
        <p className="range-note">
          {weeks} {weeks === 1 ? 'week' : 'weeks'}, {formatDayWithYear(range.from)} to{' '}
          {formatDayWithYear(range.to)}
        </p>
      )}
    </div>
  )
}
