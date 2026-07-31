import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SearchableOption = {
  value: string
  label: string
  /** Chuỗi phụ để tìm (MST, SĐT, mô tả…) */
  searchText?: string
  hint?: string
}

function normalizeSearch(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = '— Chọn —',
  searchPlaceholder = 'Gõ để tìm nhanh…',
  disabled,
  required,
  emptyText = 'Không có kết quả',
  allowClear = true,
  className,
}: {
  label?: string
  value: string
  options: SearchableOption[]
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  required?: boolean
  emptyText?: string
  allowClear?: boolean
  className?: string
}) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = normalizeSearch(query)
    if (!q) return options
    return options.filter((o) => {
      const hay = normalizeSearch(`${o.label} ${o.searchText || ''} ${o.hint || ''}`)
      return hay.includes(q)
    })
  }, [options, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open, filtered])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[activeIdx]
      if (opt) pick(opt.value)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative block space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl border border-line bg-white/80 px-3 py-2.5 text-left text-base text-ink transition',
          'hover:border-ink/30 focus:outline-none focus:ring-2 focus:ring-accent/30',
          disabled && 'cursor-not-allowed opacity-50',
          open && 'border-accent ring-2 ring-accent/20',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted')}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint ? <span className="text-muted"> · {selected.hint}</span> : null}
            </>
          ) : (
            placeholder
          )}
        </span>
        {allowClear && value && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            className="rounded-lg p-0.5 text-muted hover:bg-surface-2 hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
          >
            <X size={14} />
          </span>
        )}
        <ChevronDown size={16} className={cn('shrink-0 text-muted transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-2xl border border-line bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent py-1.5 text-base text-ink outline-none placeholder:text-muted/70"
              autoComplete="off"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-60 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">{emptyText}</p>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value
                const isActive = idx === activeIdx
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-idx={idx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => pick(opt.value)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition',
                      isActive && 'bg-accent-soft',
                      isSelected && 'font-semibold text-accent',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opt.label}</span>
                      {opt.hint && <span className="block truncate text-xs text-muted">{opt.hint}</span>}
                    </span>
                    {isSelected && <Check size={16} className="shrink-0 text-accent" />}
                  </button>
                )
              })
            )}
          </div>
          {options.length > 8 && (
            <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
              {filtered.length}/{options.length} · gõ để lọc nhanh
            </p>
          )}
        </div>
      )}
    </div>
  )
}
