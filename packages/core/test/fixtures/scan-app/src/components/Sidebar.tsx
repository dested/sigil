// @ts-nocheck -- fixture source: scanned as text by scan.test.ts, never compiled (no react/lucide types here)
import { ChevronRight, Home as HomeIcon, Settings, ShoppingCart, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'router'
type Item = { to: string; label: string; icon: LucideIcon }
export const NAV: Item[] = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/roster', label: 'Roster', icon: Users },
  {
    to: '/pos',
    title: "Point of Sale",
    icon: ShoppingCart,
  },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  // <Users /> in a comment is not a usage
  return (
    <nav>
      {NAV.map((item) => (
        <Link key={item.to} to={item.to}>
          <item.icon className="h-4 w-4" />
          <span>{item.label}</span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      ))}
    </nav>
  )
}
