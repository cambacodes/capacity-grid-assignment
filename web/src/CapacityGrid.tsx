import { type ChangeEvent, useMemo, useState } from 'react'
import { GridTable } from './GridTable'
import {
  ApiError,
  type CapacityView,
  type HoursEdit,
  MAX_WEEKLY_HOURS,
  type PersonCapacity,
  useCapacity,
  useSaveHours,
} from './capacity'

type Props = {
  from: string
  to: string
}

type Save = ReturnType<typeof useSaveHours>

// So that "ines" finds "Inés".
const foldForSearch = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function matchByName(people: PersonCapacity[], search: string) {
  const needle = foldForSearch(search.trim())
  return needle ? people.filter(({ name }) => foldForSearch(name).includes(needle)) : people
}

// CapacityGrid renders one row per person and one column per week, and owns the save of a
// person's weekly hours. Nobody can be edited while a save is in flight, so at most one
// save exists and its whole state is the mutation's. It lives here, above the loaded view,
// so it survives a range that fails to load.
export function CapacityGrid({ from, to }: Props) {
  const capacity = useCapacity(from, to)
  const save = useSaveHours()

  function handleReload() {
    void capacity.refetch()
  }

  // Data first: a failed background refresh must not take the numbers off the screen.
  if (capacity.data) {
    return (
      <LoadedGrid
        capacity={capacity.data}
        stale={capacity.isPlaceholderData}
        refreshFailed={capacity.isRefetchError}
        onRefresh={handleReload}
        save={save}
      />
    )
  }

  if (capacity.isError) return <LoadFailed onRetry={handleReload} />

  return <Skeleton />
}

type LoadedGridProps = {
  capacity: CapacityView
  stale: boolean
  refreshFailed: boolean
  onRefresh: () => void
  save: Save
}

function LoadedGrid({ capacity, stale, refreshFailed, onRefresh, save }: LoadedGridProps) {
  const [search, setSearch] = useState('')
  const [overOnly, setOverOnly] = useState(false)

  // Both lists hold confirmed data, so a row only leaves the filter once its save is confirmed.
  const candidates = overOnly ? capacity.overPeople : capacity.people
  const people = useMemo(() => matchByName(candidates, search), [candidates, search])

  function handleSearch(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value)
  }

  function handleOverOnly(event: ChangeEvent<HTMLInputElement>) {
    setOverOnly(event.target.checked)
  }

  const summary = `${capacity.overPeople.length} of ${capacity.people.length} people over capacity in these weeks`

  return (
    <section className="capacity" aria-label="Capacity by person and week">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search people"
          aria-label="Search people"
          value={search}
          onChange={handleSearch}
        />
        <label>
          <input type="checkbox" checked={overOnly} onChange={handleOverOnly} />
          Over capacity only
        </label>
        {/* The list on screen still belongs to the previous range, so it gets no claim. */}
        <p className="summary">{stale ? 'Updating…' : summary}</p>
      </div>

      <StatusLine save={save} refreshFailed={refreshFailed} onRefresh={onRefresh} />

      {people.length > 0 ? (
        <GridTable
          weeks={capacity.weeks}
          people={people}
          pending={save.isPending ? save.variables : null}
          failedId={save.isError ? save.variables.person.id : null}
          stale={stale}
          onSave={save.mutate}
        />
      ) : (
        <p className="message">
          {search ? 'Nobody matches that search.' : 'Nobody is over capacity in these weeks.'}
        </p>
      )}

      <p className="legend">
        Allocated hours count Monday to Friday. Weekly hours go from 0 to {MAX_WEEKLY_HOURS}: Enter
        saves, Esc cancels. A change applies to every week, past ones too.
      </p>
    </section>
  )
}

type StatusLineProps = {
  save: Save
  refreshFailed: boolean
  onRefresh: () => void
}

// One line with reserved height, so nothing in the grid moves when a message appears.
function StatusLine({ save, refreshFailed, onRefresh }: StatusLineProps) {
  if (save.isPending) {
    return (
      <p className="status" role="status">
        Saving {save.variables.person.name}…
      </p>
    )
  }

  if (save.isError) {
    return (
      <SaveFailed
        error={save.error}
        edit={save.variables}
        onRetry={save.mutate}
        onDismiss={save.reset}
      />
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

function describeFailure(error: Error, { person, weeklyHours }: HoursEdit) {
  const status = error instanceof ApiError ? error.status : null
  if (status === 409) {
    return { text: `${person.name}'s hours were changed elsewhere. Showing the latest.`, canRetry: false }
  }
  if (status === 404) {
    return { text: `${person.name} no longer exists.`, canRetry: false }
  }
  return { text: `Couldn't save ${person.name} (${weeklyHours} h).`, canRetry: true }
}

type SaveFailedProps = {
  error: Error
  edit: HoursEdit
  onRetry: (edit: HoursEdit) => void
  onDismiss: () => void
}

function SaveFailed({ error, edit, onRetry, onDismiss }: SaveFailedProps) {
  const { text, canRetry } = describeFailure(error, edit)

  function handleRetry() {
    onRetry(edit)
  }

  return (
    <div className="status problem" role="alert">
      {text}
      {canRetry && (
        <button type="button" onClick={handleRetry}>
          Retry
        </button>
      )}
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="message" role="alert">
      <p>Couldn't load capacity.</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

const SKELETON_ROWS = Array.from({ length: 10 }, (_, row) => row)

function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading capacity">
      {SKELETON_ROWS.map((row) => (
        <div key={row} />
      ))}
    </div>
  )
}
