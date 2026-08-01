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
  dark,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger'
  /** Đặt true khi nằm trên nền tối (bg-ink) để chữ sáng, rõ */
  dark?: boolean
}) {
  const tones = {
    default: 'text-ink',
    accent: 'text-accent',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
  }
  /* Trên nền tối dùng bản màu sáng để không bị chìm */
  const darkTones = {
    default: 'text-surface',
    accent: 'text-accent-soft',
    ok: 'text-emerald-300',
    warn: 'text-amber-300',
    danger: 'text-red-300',
  }
  return (
    <div className="min-w-0">
      <p className={cn('text-xs font-medium uppercase tracking-wider', dark ? 'text-surface/85' : 'text-muted')}>
        {label}
      </p>
      <p
        className={cn(
          'num mt-1 break-words text-xl font-extrabold leading-tight sm:text-2xl lg:text-3xl',
          dark ? darkTones[tone] : tones[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className={cn('mt-1 text-xs', dark ? 'text-surface/80' : 'text-muted')}>{hint}</p>}
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
          'w-full min-w-0 max-w-full rounded-xl border border-line bg-white/80 px-3 py-2.5 text-base text-ink placeholder:text-muted/70',
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
    accent: 'bg-accent-soft text-accent-hot',
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Đóng" />
      <div
        className={cn(
          'relative z-10 flex max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl animate-fade-up sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/60 px-4 py-3 sm:px-5">
          <h3 className="min-w-0 flex-1 break-words font-display text-lg font-bold sm:text-xl">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} type="button" className="shrink-0">
            Đóng
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          {children}
        </div>
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
  /** Nhiều tab (Cài đặt…): lưới 2 cột trên mobile để chữ không bị chèn */
  const many = tabs.length > 3
  return (
    <div
      className={cn(
        'mb-4',
        many
          ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap'
          : 'flex flex-wrap gap-2',
      )}
      role="tablist"
    >
      {tabs.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-center text-sm font-semibold leading-snug transition active:scale-[0.98]',
              many ? 'w-full lg:w-auto lg:min-w-[7.5rem]' : 'min-w-[5.5rem] flex-1 sm:flex-none',
              active
                ? 'border-accent bg-accent text-white shadow-sm'
                : 'border-line bg-card text-ink hover:bg-surface-2',
            )}
          >
            <span className="block break-words">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
