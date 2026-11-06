import { type Range, defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import {
  type ChangeEvent,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  type SyntheticEvent,
  memo,
  useCallback,
  useRef,
  useState,
} from 'react'
import { type HoursEdit, type Person, type PersonCapacity, parseHours } from './capacity'
import { formatDay, yearOf } from './weeks'

const ROW_HEIGHT = 44
const NAME_WIDTH = 224
const HOURS_WIDTH = 104
const WEEK_WIDTH = 80
const FIXED_COLUMNS = 2
const OVERSCAN_ROWS = 8

const NAME_COLUMN = { width: NAME_WIDTH }
const HOURS_COLUMN = { width: HOURS_WIDTH }
const WEEK_COLUMN = { width: WEEK_WIDTH }

const hoursFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

// Typing replaces the hours, also when the field already had focus from the last save.
function selectHours(event: SyntheticEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

type Props = {
  weeks: string[]
  people: PersonCapacity[]
  // The save in flight, if any. Its hours replace the confirmed ones in that row.
  pending: HoursEdit | null
  failedId: number | null
  // The rows still belong to the previous range while a new one loads.
  updating: boolean
  onSave: (edit: HoursEdit) => void
}

// Rows are drawn only near the viewport: drawing 3,000 people costs about 500 ms per range
// change at 12 weeks and over 7 s at two years, against 10 ms and 130 ms this way. They are
// real table rows between spacers, which keeps table semantics and sticky columns for free.
export function GridTable({ weeks, people, pending, failedId, updating, onSave }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const focusedIndex = people.findIndex(({ id }) => id === focusedId)

  // A row being typed in stays drawn when scrolled away, so the text is not lost.
  function keepFocusedRow(range: Range) {
    const indexes = defaultRangeExtractor(range)
    if (focusedIndex === -1 || indexes.includes(focusedIndex)) return indexes
    return [...indexes, focusedIndex].sort((a, b) => a - b)
  }

  // Stable on purpose: the virtualizer re-measures every row when this function changes,
  // and the table re-renders on each scroll tick.
  const rowKey = useCallback((index: number) => people[index].id, [people])

  const virtualizer = useVirtualizer({
    count: people.length,
    getScrollElement: () => scroller.current,
    getItemKey: rowKey,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    rangeExtractor: keepFocusedRow,
  })

  const items = virtualizer.getVirtualItems()
  const rows = items.map((item, position) => {
    const person = people[item.index]
    return {
      key: item.key,
      gapBefore: item.start - (items[position - 1]?.end ?? 0),
      person,
      pendingHours: pending?.person.id === person.id ? pending.weeklyHours : null,
      failed: failedId === person.id,
    }
  })
  const gapAfter = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)

  const locked = pending !== null
  const columns = weeks.length + FIXED_COLUMNS
  const tableStyle = { width: NAME_WIDTH + HOURS_WIDTH + WEEK_WIDTH * weeks.length }
  const scrollerClass = updating ? 'scroller updating' : 'scroller'

  return (
    <div ref={scroller} className={scrollerClass} aria-busy={updating}>
      <table style={tableStyle}>
        <colgroup>
          <col style={NAME_COLUMN} />
          <col style={HOURS_COLUMN} />
          {weeks.map((week) => (
            <col key={week} style={WEEK_COLUMN} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="name">
              Person
            </th>
            <th scope="col" className="hours">
              Hours/week
            </th>
            {weeks.map((week) => (
              <WeekHeading key={week} week={week} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, gapBefore, ...row }) => (
            <Fragment key={key}>
              <Spacer height={gapBefore} columns={columns} />
              <Row {...row} locked={locked} onSave={onSave} onFocusChange={setFocusedId} />
            </Fragment>
          ))}
          <Spacer height={gapAfter} columns={columns} />
        </tbody>
      </table>
    </div>
  )
}

function WeekHeading({ week }: { week: string }) {
  const day = formatDay(week)
  const year = yearOf(week)

  return (
    <th scope="col">
      {day}
      <small>{year}</small>
    </th>
  )
}

function Spacer({ height, columns }: { height: number; columns: number }) {
  if (height <= 0) return null

  const style = { height }

  return (
    <tr aria-hidden="true">
      <td className="spacer" colSpan={columns} style={style} />
    </tr>
  )
}

type RowProps = {
  person: PersonCapacity
  pendingHours: number | null
  failed: boolean
  locked: boolean
  onSave: (edit: HoursEdit) => void
  onFocusChange: (id: number | null) => void
}

// Memoized because the virtualizer re-renders the table on every scroll tick. Props are
// primitives, stable callbacks, and person objects that React Query's structural sharing
// keeps identical across refetches.
const Row = memo(function Row({ person, pendingHours, ...hoursCell }: RowProps) {
  const weeklyHours = pendingHours ?? person.weeklyHours

  return (
    <tr>
      <th scope="row" className="name" title={person.name}>
        {person.name}
      </th>
      <HoursCell person={person} shownHours={weeklyHours} saving={pendingHours !== null} {...hoursCell} />
      {person.allocated.map((allocated, weekIndex) => (
        <WeekCell key={weekIndex} allocated={allocated} weeklyHours={weeklyHours} />
      ))}
    </tr>
  )
})

function WeekCell({ allocated, weeklyHours }: { allocated: number; weeklyHours: number }) {
  const hours = hoursFormat.format(allocated)
  const over = allocated - weeklyHours

  if (over > 0) {
    const overLabel = `${hoursFormat.format(over)} h over`
    return (
      <td className="week over">
        {hours}
        <small>{overLabel}</small>
      </td>
    )
  }

  const className = allocated === 0 ? 'week idle' : 'week'

  return <td className={className}>{hours}</td>
}

// What the manager typed, and the person as they looked when typing began.
type Draft = { text: string; person: Person }

type HoursCellProps = Omit<RowProps, 'pendingHours'> & {
  shownHours: number
  saving: boolean
}

// The hours are always an input, so editing moves nothing on screen and focus stays put.
// The draft is local: it starts on the first keystroke and ends on save or Escape. That
// keeps one edit at a time simple, since only the focused input can hold a valid draft,
// and no save response can close anything because this state never depends on a response.
function HoursCell({ person, shownHours, saving, failed, locked, onSave, onFocusChange }: HoursCellProps) {
  const [draft, setDraft] = useState<Draft | null>(null)

  function commit() {
    if (!draft) return
    const weeklyHours = parseHours(draft.text)
    // An invalid value stays in the field, marked, rather than being thrown away.
    if (weeklyHours === null) return
    setDraft(null)
    if (weeklyHours !== draft.person.weeklyHours) onSave({ person: draft.person, weeklyHours })
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!locked) setDraft({ text: event.target.value, person: draft?.person ?? person })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') commit()
    if (event.key === 'Escape') setDraft(null)
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    selectHours(event)
    onFocusChange(person.id)
  }

  function handleBlur() {
    commit()
    onFocusChange(null)
  }

  const cellClass = failed ? 'hours failed' : 'hours'
  const inputClass = saving ? 'hours-input saving' : 'hours-input'
  const label = `Weekly hours for ${person.name}`
  const invalid = draft !== null && parseHours(draft.text) === null
  const value = draft?.text ?? hoursFormat.format(shownHours)

  return (
    <td className={cellClass}>
      <input
        className={inputClass}
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid}
        readOnly={locked}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={selectHours}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </td>
  )
}
