// @ts-nocheck -- fixture source: scanned as text by scan.test.ts, never compiled (no react/lucide types here)
import { Plus, Search, Users } from 'lucide-react'

export function RosterPage() {
  return (
    <div>
      <h1><Users aria-label="Roster" className="h-5 w-5" /></h1>
      <button><Plus className="h-4 w-4" /> Add player</button>
      <Search className="h-4 w-4" />
      <input placeholder="Find a player" />
      <p>Users are listed below</p>
    </div>
  )
}
