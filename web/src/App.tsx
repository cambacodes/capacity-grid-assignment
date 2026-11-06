import { useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { RangeControls } from './RangeControls'
import { wholeWeeks } from './weeks'

// The grid opens on the seed's hand-written cases. A production page would open on the
// current week instead, which here can land on a week with no assignments at all.
const INITIAL_RANGE = wholeWeeks({ from: '2025-12-29', to: '2026-01-16' })

// The range lives here, above the grid, so the team page can share it with the timeline.
export function App() {
  const [range, setRange] = useState(INITIAL_RANGE)

  return (
    <main>
      <h1>Team capacity</h1>
      <RangeControls range={range} onChange={setRange} />
      <CapacityGrid from={range.from} to={range.to} />
    </main>
  )
}
