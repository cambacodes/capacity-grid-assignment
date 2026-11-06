import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

export type Person = { id: number; name: string; weeklyHours: number }

export type PersonCapacity = Person & {
  // Hours allocated per week, aligned with Capacity.weeks by index.
  allocated: number[]
}

export type Capacity = {
  from: string
  to: string
  weeks: string[]
  people: PersonCapacity[]
}

export type HoursEdit = {
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

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init)
  if (!response.ok) throw new ApiError(response.status)
  return (await response.json()) as T
}

const CAPACITY_KEY = 'capacity'

export const capacityQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: [CAPACITY_KEY, from, to],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ from, to })
      const { capacity } = await request<{ capacity: Capacity }>(`/api/capacity?${params}`, {
        signal,
      })
      return capacity
    },
    placeholderData: keepPreviousData,
    retry: 1,
  })

// Saves one person's weekly hours. The cached ranges only change once the server
// confirms, so a failed save has nothing to undo. The grid shows the pending value
// from the mutation's own variables.
export function useSaveHours() {
  const queryClient = useQueryClient()
  const capacityRanges = { queryKey: [CAPACITY_KEY] }

  return useMutation({
    mutationFn: async ({ person, weeklyHours }: HoursEdit) => {
      const { person: saved } = await request<{ person: Person }>(`/api/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyHours, expectedWeeklyHours: person.weeklyHours }),
        signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
      })
      return saved
    },

    // A save never moves allocated hours, so the response holds everything that changed.
    // Any GET still on its way may have read the old hours and has to go first: invalidating
    // alone would not stop it, because a range with no data yet is joined, not restarted.
    // Every cached range is rewritten from its own rows, never from whichever range is on
    // screen now: the manager may have moved on while the save was in flight.
    onSuccess: async (saved) => {
      await queryClient.cancelQueries(capacityRanges)
      queryClient.setQueriesData<Capacity>(
        capacityRanges,
        (range) =>
          range && {
            ...range,
            people: range.people.map((person) =>
              person.id === saved.id ? { ...person, weeklyHours: saved.weeklyHours } : person,
            ),
          },
      )
    },

    // Reloads what the save cancelled, and shows the latest hours after a conflict.
    // Not returned: the manager should not wait for a full grid to edit the next person.
    onSettled: () => {
      void queryClient.invalidateQueries(capacityRanges)
    },
  })
}
