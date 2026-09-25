// @ts-nocheck -- fixture source: scanned as text by scan.test.ts, never compiled (no react/lucide types here)
import {
  ShoppingCart,
  X,
} from 'lucide-react'

const label = 'X'

export function Checkout() {
  return (
    <header>
      <ShoppingCart className="h-4 w-4" /> Point of Sale
      <IconButton icon={X} label="Close cart" />
    </header>
  )
}
