import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant
  readonly size?: 'md' | 'sm'
  readonly busy?: boolean
  readonly className?: string
  readonly children: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white border border-ink hover:bg-ink/90',
  secondary: 'bg-panel text-ink border border-border hover:border-border-2',
  danger: 'bg-panel text-error border border-border hover:border-border-2',
}

const SIZES = { md: 'h-8 px-3 text-[13px]', sm: 'h-7 px-2.5 text-[12.5px]' } as const

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  disabled = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const off = disabled || busy
  return (
    <button
      type={type}
      disabled={off}
      aria-busy={busy}
      className={`inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg font-medium transition-colors ${SIZES[size]} ${VARIANTS[variant]} disabled:cursor-not-allowed disabled:border-border disabled:bg-panel-2 disabled:text-ink-3 ${className}`}
      {...rest}
    >
      {children}
      {busy ? <span aria-hidden="true">…</span> : null}
    </button>
  )
}
