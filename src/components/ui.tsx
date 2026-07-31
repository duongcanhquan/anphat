import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Bento({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children?: ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <section className={cn('bento p-4 sm:p-5 animate-fade-up', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="font-display text-lg font-bold tracking-tight text-ink sm:text-xl">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatBig({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger'
}) {
  const tones = {
    default: 'text-ink',
    accent: 'text-accent',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
  }
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p
        className={cn(
          'num mt-1 break-words text-xl font-extrabold leading-tight sm:text-2xl lg:text-3xl',
          tones[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}) {
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hot shadow-sm',
    secondary: 'bg-ink text-surface hover:bg-ink-soft',
    ghost: 'bg-transparent text-ink hover:bg-surface-2',
    danger: 'bg-danger text-white hover:opacity-90',
    outline: 'border border-line bg-card text-ink hover:bg-surface-2',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded-xl',
    md: 'px-4 py-2.5 text-sm rounded-xl',
    lg: 'px-5 py-3.5 text-base rounded-2xl',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

export function Input({
  className,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <input
        className={cn(
          'w-full rounded-xl border border-line bg-white/80 px-3 py-2.5 text-base text-ink placeholder:text-muted/70',
          className,
        )}
        {...props}
      />
    </label>
  )
}

export function Textarea({
  className,
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <textarea
        className={cn(
          'w-full rounded-xl border border-line bg-white/80 px-3 py-2.5 text-base text-ink placeholder:text-muted/70 min-h-[88px]',
          className,
        )}
        {...props}
      />
    </label>
  )
}

export function Select({
  className,
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <select
        className={cn(
          'w-full rounded-xl border border-line bg-white/80 px-3 py-2.5 text-base text-ink',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  )
}

export { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect'

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'
}) {
  const tones = {
    default: 'bg-surface-2 text-ink-soft',
    accent: 'bg-accent-soft text-accent',
    ok: 'bg-emerald-100 text-ok',
    warn: 'bg-amber-100 text-warn',
    danger: 'bg-red-100 text-danger',
    info: 'bg-sky-100 text-info',
  }
  return (
    <span className={cn('inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-4 py-10 text-center text-sm text-muted">
      {text}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Đóng" />
      <div
        className={cn(
          'relative z-10 max-h-[min(92dvh,100%)] w-full overflow-x-hidden overflow-y-auto rounded-t-3xl bg-card p-4 shadow-2xl animate-fade-up sm:rounded-3xl sm:p-5',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-xl font-bold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Đóng
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted sm:text-base">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-surface-2/80 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition',
            value === t.id ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
