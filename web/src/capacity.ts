import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { type } from 'arktype'

// The API contract. Types come from these schemas, so a response that drifts from
// them fails here, at the boundary, instead of as a wrong number in the grid.
const person = type({ id: 'number', name: 'string', weeklyHours: 'number' })

const capacityResponse = type({
  capacity: {
    from: 'string',
    to: 'string',
    // Monday of each week. PersonCapacity.allocated follows this order.
    weeks: 'string[]',
    people: person.and({ allocated: 'number[]' }).array(),
  },
})

const personResponse = type({ person })

export type Person = typeof person.infer
export type Capacity = typeof capacityResponse.infer.capacity
export type PersonCapacity = Capacity['people'][number]

export type HoursEdit = {
  // The person as the manager saw them, whose hours the server compares against.
  person: Person
  weeklyHours: number
}

// Same limit the API enforces in api/people.go.
export const MAX_WEEKLY_HOURS = 168

const SAVE_TIMEOUT_MS = 10_000

// Accepts a decimal comma, which is what a manager in most of Europe types.
export function parseHours(text: string) {
  const hours = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && hours >= 0 && hours <= MAX_WEEKLY_HOURS ? hours : null
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`The API answered ${status}`)
    this.status = status
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (!response.ok) throw new ApiError(response.status)
  return response.json()
}

const CAPACITY_KEY = 'capacity'
const ALL_RANGES = { queryKey: [CAPACITY_KEY] }

export const capacityQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: [CAPACITY_KEY, from, to],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ from, to })
      const body = await readBody(await fetch(`/api/capacity?${params}`, { signal }))
      return capacityResponse.assert(body).capacity
    },
    // A new range keeps the previous one on screen until it arrives.
    placeholderData: keepPreviousData,
  })

const isOverCapacity = ({ allocated, weeklyHours }: PersonCapacity) =>
  allocated.some((hours) => hours > weeklyHours)

// Counted over the whole roster and range, never over what happens to be drawn.
// Module level on purpose: a stable select only reruns when the data changes.
const withOverPeople = (capacity: Capacity) => ({
  ...capacity,
  overPeople: capacity.people.filter(isOverCapacity),
})

export type CapacityView = ReturnType<typeof withOverPeople>

export function useCapacity(from: string, to: string) {
  return useQuery({ ...capacityQuery(from, to), select: withOverPeople })
}

const withSavedHours = (saved: Person) => (range: Capacity | undefined) =>
  range && {
    ...range,
    people: range.people.map((candidate) =>
      candidate.id === saved.id ? { ...candidate, weeklyHours: saved.weeklyHours } : candidate,
    ),
  }

// Saves one person's weekly hours. The cached ranges only change once the server
// confirms, so a failed save has nothing to undo. The grid shows the pending value
// from the mutation's own variables.
export function useSaveHours() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ person, weeklyHours }: HoursEdit) => {
      const response = await fetch(`/api/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyHours, expectedWeeklyHours: person.weeklyHours }),
        signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
      })
      return personResponse.assert(await readBody(response)).person
    },

    // A save never moves allocated hours, so the response holds everything that changed.
    // Any GET still on its way may have read the old hours and has to go first: invalidating
    // alone would not stop it, because a range with no data yet is joined, not restarted.
    // Every cached range is rewritten from its own rows, never from whichever range is on
    // screen now: the manager may have moved on while the save was in flight.
    onSuccess: async (saved) => {
      await queryClient.cancelQueries(ALL_RANGES)
      queryClient.setQueriesData<Capacity>(ALL_RANGES, withSavedHours(saved))
    },

    // Reloads what the save cancelled, and shows the latest hours after a conflict.
    // Not returned: the manager should not wait for a full grid to edit the next person.
    onSettled: () => {
      void queryClient.invalidateQueries(ALL_RANGES)
    },
  })
}
