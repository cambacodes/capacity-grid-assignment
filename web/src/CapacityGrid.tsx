import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { type Editing, GridTable } from './GridTable'
import {
  ApiError,
  type HoursEdit,
  MAX_WEEKLY_HOURS,
  type Person,
  type PersonCapacity,
  capacityQuery,
  parseHours,
  useSaveHours,
} from './capacity'

type Props = {
  from: string
  to: string
}

const isOverCapacity = ({ allocated, weeklyHours }: PersonCapacity) =>
  allocated.some((hours) => hours > weeklyHours)

// So that "ines" finds "Inés".
const foldForSearch = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// CapacityGrid renders one row per person and one column per week, and owns the edit of
// a person's weekly hours. One person is edited at a time and nobody else can be opened
// until that save settles, so at most one save exists and its state is the mutation's.
export function CapacityGrid({ from, to }: Props) {
  const capacity = useQuery(capacityQuery(from, to))
  const save = useSaveHours()

  const [editing, setEditing] = useState<Editing | null>(null)
  const [search, setSearch] = useState('')
  const [overOnly, setOverOnly] = useState(false)

  const everyone = capacity.data?.people
  const overCount = useMemo(() => everyone?.filter(isOverCapacity).length ?? 0, [everyone])

  // Filters read confirmed data, so a row only leaves the list once its save is confirmed.
  const people = useMemo(() => {
    const needle = foldForSearch(search.trim())
    return (everyone ?? []).filter(
      (person) =>
        (!overOnly || isOverCapacity(person)) && foldForSearch(person.name).includes(needle),
    )
  }, [everyone, search, overOnly])

  const onStartEdit = useCallback(
    (person: Person) => setEditing({ person, text: String(person.weeklyHours) }),
    [],
  )

  const onTypeHours = useCallback(
    (text: string) => setEditing((current) => current && { ...current, text }),
    [],
  )

  const { mutate } = save
  const onFinishEdit = useCallback(
    ({ person, text }: Editing, cancelled: boolean) => {
      const weeklyHours = parseHours(text)
      // An invalid value stays open with its message rather than being thrown away.
      if (!cancelled && weeklyHours === null) return
      setEditing(null)
      if (!cancelled && weeklyHours !== null && weeklyHours !== person.weeklyHours) {
        mutate({ person, weeklyHours })
      }
    },
    [mutate],
  )

  const pending = save.isPending
    ? { id: save.variables.person.id, weeklyHours: save.variables.weeklyHours }
    : null

  return (
    <section className="capacity" aria-label="Capacity by person and week">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search people"
          aria-label="Search people"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={overOnly}
            onChange={(event) => setOverOnly(event.target.checked)}
          />
          Over capacity only
        </label>
        <p className="summary">
          {capacity.isPlaceholderData
            ? 'Updating…'
            : everyone && `${overCount} of ${everyone.length} people over capacity in these weeks`}
        </p>
      </div>

      <StatusLine
        editing={editing}
        save={save}
        refreshFailed={capacity.isRefetchError}
        onRefresh={() => void capacity.refetch()}
      />

      {/* Data first: a failed background refresh must not take the numbers off the screen. */}
      {capacity.data ? (
        people.length > 0 ? (
          <GridTable
            weeks={capacity.data.weeks}
            people={people}
            editing={editing}
            locked={save.isPending || editing !== null}
            pending={pending}
            failedId={save.isError ? save.variables.person.id : null}
            stale={capacity.isPlaceholderData}
            onStartEdit={onStartEdit}
            onTypeHours={onTypeHours}
            onFinishEdit={onFinishEdit}
          />
        ) : (
          <p className="message">
            {search ? 'Nobody matches that search.' : 'Nobody is over capacity in these weeks.'}
          </p>
        )
      ) : capacity.isError ? (
        <div className="message" role="alert">
          <p>Couldn't load capacity.</p>
          <button type="button" onClick={() => void capacity.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <Skeleton />
      )}

      <p className="legend">
        Hours allocated per week, counting Monday to Friday. Red means more than the person's weekly
        hours.
      </p>
    </section>
  )
}

function saveFailure(error: Error, { person, weeklyHours }: HoursEdit) {
  if (error instanceof ApiError && error.status === 409) {
    return { text: `${person.name}'s hours were changed elsewhere. Showing the latest.`, canRetry: false }
  }
  if (error instanceof ApiError && error.status === 404) {
    return { text: `${person.name} no longer exists.`, canRetry: false }
  }
  return { text: `Couldn't save ${person.name} (${weeklyHours} h).`, canRetry: true }
}

type StatusLineProps = {
  editing: Editing | null
  save: ReturnType<typeof useSaveHours>
  refreshFailed: boolean
  onRefresh: () => void
}

// One line with reserved height, so nothing in the grid moves when a message appears.
function StatusLine({ editing, save, refreshFailed, onRefresh }: StatusLineProps) {
  if (editing) {
    return parseHours(editing.text) === null ? (
      <p className="status problem" role="alert">
        Enter hours from 0 to {MAX_WEEKLY_HOURS}, or press Esc.
      </p>
    ) : (
      <p className="status">
        {editing.person.name}: this changes every week, past ones too. Enter saves, Esc cancels.
      </p>
    )
  }

  if (save.isPending) {
    return (
      <p className="status" role="status">
        Saving {save.variables.person.name}…
      </p>
    )
  }

  if (save.isError) {
    const failure = saveFailure(save.error, save.variables)
    return (
      <div className="status problem" role="alert">
        {failure.text}
        {failure.canRetry && (
          <button type="button" onClick={() => save.mutate(save.variables)}>
            Retry
          </button>
        )}
        <button type="button" onClick={() => save.reset()}>
          Dismiss
        </button>
      </div>
    )
  }

  if (refreshFailed) {
    return (
      <div className="status problem" role="alert">
        Couldn't refresh. These numbers may be out of date.
        <button type="button" onClick={onRefresh}>
          Retry
        </button>
      </div>
    )
  }

  if (save.isSuccess) {
    return (
      <p className="status" role="status">
        Saved {save.data.name}: {save.data.weeklyHours} h.
      </p>
    )
  }

  return <p className="status" />
}

function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading capacity">
      {Array.from({ length: 10 }, (_, row) => (
        <div key={row} />
      ))}
    </div>
  )
}
