import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CapacityGrid } from './CapacityGrid'
import { type Capacity, capacityQuery } from './capacity'
import { createQueryClient } from './queryClient'

const FIRST = { from: '2026-01-05', to: '2026-01-11' }
const SECOND = { from: '2026-01-12', to: '2026-01-18' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

// A promise the test settles by hand, to hold a response back.
function held<T>() {
  let release!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

// Stands in for the API: Dee is over capacity in every range, and `hours` is the database.
function fakeApi() {
  const api = {
    hours: 40,
    patches: [] as unknown[],
    nextPatch: async (): Promise<Response> => json({}),
    holdGets: null as Promise<void> | null,
  }

  const capacity = (from: string, to: string, hours: number): { capacity: Capacity } => ({
    capacity: {
      from,
      to,
      weeks: [from],
      people: [
        { id: 2, name: 'Bo Lindqvist', weeklyHours: 40, allocated: [32] },
        { id: 4, name: 'Dee Okafor', weeklyHours: hours, allocated: [45] },
      ],
    },
  })

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      api.patches.push(JSON.parse(String(init.body)))
      return api.nextPatch()
    }
    const params = new URL(url, 'http://test').searchParams
    // A real GET reads the database first and may answer long after.
    const hoursWhenRead = api.hours
    if (api.holdGets) await api.holdGets
    return json(capacity(params.get('from')!, params.get('to')!, hoursWhenRead))
  })

  return api
}

const hoursInput = (name: string) =>
  screen.findByRole<HTMLInputElement>('textbox', { name: `Weekly hours for ${name}` })

const hoursOf = (client: QueryClient, { from, to }: typeof FIRST) => {
  const capacity = client.getQueryData(capacityQuery(from, to).queryKey)
  return { weeks: capacity?.weeks, dee: capacity?.people.find(({ id }) => id === 4)?.weeklyHours }
}

beforeEach(() => {
  // jsdom has no layout, and the virtualizer draws nothing in a zero-height viewport.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a save stays correct through a failure, a range change and a late response', async () => {
  const api = fakeApi()
  const client = createQueryClient()
  const grid = (range: typeof FIRST) => (
    <QueryClientProvider client={client}>
      <CapacityGrid {...range} />
    </QueryClientProvider>
  )
  const { rerender } = render(grid(FIRST))

  // The first attempt fails: the confirmed number stays and the typed one can be retried.
  const dee = await hoursInput('Dee Okafor')
  fireEvent.change(dee, { target: { value: '48' } })
  api.nextPatch = async () => json({ error: 'boom' }, 500)
  fireEvent.keyDown(dee, { key: 'Enter' })

  await screen.findByText(/Couldn't save Dee Okafor \(48 h\)/)
  expect(dee.value).toBe('40')
  expect(screen.getByText('5 h over')).toBeTruthy()

  // The retry is in flight: the grid shows the new hours, and nobody else can be edited.
  const patch = held<Response>()
  api.nextPatch = () => patch.promise
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

  await waitFor(() => expect(dee.value).toBe('48'))
  expect(screen.queryByText('5 h over')).toBeNull()
  const bo = await hoursInput('Bo Lindqvist')
  fireEvent.change(bo, { target: { value: '10' } })
  expect(bo.value).toBe('40')

  // The manager moves on, and that range is read before the save commits.
  const lateGet = held<void>()
  api.holdGets = lateGet.promise
  rerender(grid(SECOND))

  api.hours = 48
  patch.release(json({ person: { id: 4, name: 'Dee Okafor', weeklyHours: 48 } }))
  await screen.findByText('Saved Dee Okafor: 48 h.')

  // The late answer still carries 40. It must not win over the confirmed save.
  api.holdGets = null
  lateGet.release()

  await waitFor(() => expect(hoursOf(client, SECOND)).toEqual({ weeks: [SECOND.from], dee: 48 }))
  expect((await hoursInput('Dee Okafor')).value).toBe('48')

  // The range left behind holds its own weeks, with the new hours.
  expect(hoursOf(client, FIRST)).toEqual({ weeks: [FIRST.from], dee: 48 })
  expect(api.patches).toEqual([
    { weeklyHours: 48, expectedWeeklyHours: 40 },
    { weeklyHours: 48, expectedWeeklyHours: 40 },
  ])
})
