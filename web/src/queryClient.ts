import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './capacity'

const FRESH_FOR_MS = 30_000
const KEEP_UNUSED_RANGE_MS = 5 * 60_000

// A 4xx will answer the same way again, so only network and server failures get a retry.
function retryOnce(failures: number, error: Error) {
  const rejected = error instanceof ApiError && error.status < 500
  return failures < 1 && !rejected
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Moving back and forth between weeks reuses what is loaded, while a save
        // invalidates every range at once. Refocusing the tab reloads anything older.
        staleTime: FRESH_FOR_MS,
        refetchOnWindowFocus: true,
        // Up to about 1 MB per range at full roster and two years, so unused ones go.
        gcTime: KEEP_UNUSED_RANGE_MS,
        retry: retryOnce,
        // The default pauses while offline, which would leave a skeleton on screen forever.
        networkMode: 'always',
      },
      mutations: {
        retry: false,
        // Same here: a paused save would stay on "Saving…" and lock every other edit.
        networkMode: 'always',
      },
    },
  })
}
