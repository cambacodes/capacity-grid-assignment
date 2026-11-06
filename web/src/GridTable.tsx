import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { type KeyboardEvent, type ReactNode, type RefObject, memo, useCallback, useRef } from 'react'
import { type Person, type PersonCapacity, parseHours } from './capacity'
import { formatDay } from './weeks'

const ROW_HEIGHT = 44
const NAME_WIDTH = 224
const HOURS_WIDTH = 88
const WEEK_WIDTH = 80
const FIXED_COLUMNS = 2

const hoursFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

// The person being edited. `text` is the input's raw value, which may not be valid yet.
export type Editing = { person: Person; text: string }

type RowActions = {
  onStartEdit: (person: Person) => void
  onTypeHours: (text: string) => void
  // Called when the editor loses focus, the only way it closes.
  onFinishEdit: (editing: Editing, cancelled: boolean) => void
}

type Props = RowActions & {
  weeks: string[]
  people: PersonCapacity[]
  editing: Editing | null
  // Nobody else can be edited while this is true: one edit and one save at a time.
  locked: boolean
  // The pending value of the save in flight, shown in place of the confirmed hours.
  pending: { id: number; weeklyHours: number } | null
  failedId: number | null
  stale: boolean
}

// Rows are drawn only when near the viewport. Drawing a roster of 3,000 people costs
// about 500 ms per range change at 12 weeks and over 7 s at two years.
export function GridTable({ weeks, people, editing, locked, pending, failedId, stale, ...actions }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const refocus = useRef<number | null>(null)

  const editingIndex = editing ? people.findIndex(({ id }) => id === editing.person.id) : -1

  const virtualizer = useVirtualizer({
    count: people.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    // Scrolling away must not unmount the input and lose what was typed.
    rangeExtractor: useCallback(
      (range: Parameters<typeof defaultRangeExtractor>[0]) => {
        const indexes = defaultRangeExtractor(range)
        if (editingIndex === -1 || indexes.includes(editingIndex)) return indexes
        return [...indexes, editingIndex].sort((a, b) => a - b)
      },
      [editingIndex],
    ),
  })

  const columns = weeks.length + FIXED_COLUMNS
  const rows: ReactNode[] = []
  let drawnTo = 0

  for (const item of virtualizer.getVirtualItems()) {
    if (item.start > drawnTo) rows.push(<Spacer key={`gap-${item.index}`} height={item.start - drawnTo} columns={columns} />)
    const person = people[item.index]
    rows.push(
      <Row
        key={person.id}
        person={person}
        weeklyHours={pending?.id === person.id ? pending.weeklyHours : person.weeklyHours}
        saving={pending?.id === person.id}
        failed={failedId === person.id}
        editing={editing?.person.id === person.id ? editing : null}
        locked={locked}
        refocus={refocus}
        {...actions}
      />,
    )
    drawnTo = item.end
  }
  const total = virtualizer.getTotalSize()
  if (total > drawnTo) rows.push(<Spacer key="gap-end" height={total - drawnTo} columns={columns} />)

  return (
    <div ref={scroller} className={stale ? 'scroller stale' : 'scroller'} aria-busy={stale}>
      <table style={{ width: NAME_WIDTH + HOURS_WIDTH + WEEK_WIDTH * weeks.length }}>
        <colgroup>
          <col style={{ width: NAME_WIDTH }} />
          <col style={{ width: HOURS_WIDTH }} />
          {weeks.map((week) => (
            <col key={week} style={{ width: WEEK_WIDTH }} />
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
              <th scope="col" key={week}>
                {formatDay(week)}
                <small>{week.slice(0, 4)}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

function Spacer({ height, columns }: { height: number; columns: number }) {
  return (
    <tr aria-hidden="true">
      <td className="spacer" colSpan={columns} style={{ height }} />
    </tr>
  )
}

type RowProps = RowActions & {
  person: PersonCapacity
  weeklyHours: number
  saving: boolean
  failed: boolean
  editing: Editing | null
  locked: boolean
  refocus: RefObject<number | null>
}

const Row = memo(function Row({
  person,
  weeklyHours,
  saving,
  failed,
  editing,
  locked,
  refocus,
  onStartEdit,
  onTypeHours,
  onFinishEdit,
}: RowProps) {
  // Blur is the single way out of the editor, so a save can never fire twice.
  // Enter and Escape only decide how it leaves and hand keyboard focus back.
  const cancelled = useRef(false)

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && editing && parseHours(editing.text) !== null) {
      refocus.current = person.id
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      cancelled.current = true
      refocus.current = person.id
      event.currentTarget.blur()
    }
  }

  return (
    <tr>
      <th scope="row" className="name" title={person.name}>
        {person.name}
      </th>
      <td className={failed ? 'hours failed' : 'hours'}>
        {editing === null ? (
          <button
            type="button"
            className={saving ? 'hours-button saving' : 'hours-button'}
            aria-disabled={locked}
            aria-label={`Weekly hours for ${person.name}: ${hoursFormat.format(weeklyHours)}. Edit`}
            ref={(button) => {
              if (button && refocus.current === person.id) {
                refocus.current = null
                button.focus()
              }
            }}
            onClick={() => {
              if (!locked) onStartEdit(person)
            }}
          >
            {hoursFormat.format(weeklyHours)}
          </button>
        ) : (
          <input
            className="hours-input"
            inputMode="decimal"
            aria-label={`Weekly hours for ${person.name}`}
            aria-invalid={parseHours(editing.text) === null}
            autoFocus
            value={editing.text}
            onFocus={(event) => event.target.select()}
            onChange={(event) => onTypeHours(event.target.value)}
            onKeyDown={handleKey}
            onBlur={() => {
              onFinishEdit(editing, cancelled.current)
              cancelled.current = false
            }}
          />
        )}
      </td>
      {person.allocated.map((allocated, week) => {
        const over = allocated - weeklyHours
        return (
          <td key={week} className={over > 0 ? 'week over' : allocated === 0 ? 'week idle' : 'week'}>
            {hoursFormat.format(allocated)}
            {over > 0 && <small>{hoursFormat.format(over)} h over</small>}
          </td>
        )
      })}
    </tr>
  )
})
