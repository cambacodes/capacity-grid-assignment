import { useState } from 'react'
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

  function type(next: DateRange) {
    setTyped(next)
    if (!rangeProblem(next)) onChange(wholeWeeks(next))
  }

  function move(next: DateRange) {
    setTyped(null)
    onChange(next)
  }

  const finishTyping = () => {
    if (!problem) setTyped(null)
  }

  const weeks = weekCount(range)

  return (
    <div className="range">
      <button type="button" aria-label="Previous week" onClick={() => move(shiftWeeks(range, -1))}>
        ←
      </button>
      <button type="button" onClick={() => move(thisWeek(range, new Date()))}>
        This week
      </button>
      <button type="button" aria-label="Next week" onClick={() => move(shiftWeeks(range, 1))}>
        →
      </button>
      <label>
        From
        <input
          type="date"
          value={shown.from}
          aria-invalid={problem !== null}
          onChange={(event) => type({ ...shown, from: event.target.value })}
          onBlur={finishTyping}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={shown.to}
          aria-invalid={problem !== null}
          onChange={(event) => type({ ...shown, to: event.target.value })}
          onBlur={finishTyping}
        />
      </label>
      {problem ? (
        <p className="range-note range-problem" role="alert">
          {problem}
        </p>
      ) : (
        <p className="range-note">
          {weeks} {weeks === 1 ? 'week' : 'weeks'}, {formatDay(range.from)} to {formatDay(range.to)}
        </p>
      )}
    </div>
  )
}
