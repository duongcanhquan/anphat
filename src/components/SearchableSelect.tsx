import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
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

function useIsMobile(breakpoint = 640) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : true,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])
  return mobile
}

type PanelPos = { top: number; left: number; width: number; maxHeight: number; openUp: boolean }

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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [pos, setPos] = useState<PanelPos | null>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = normalizeSearch(query)
    if (!q) return options
    return options.filter((o) => {
      const hay = normalizeSearch(`${o.label} ${o.searchText || ''} ${o.hint || ''}`)
      return hay.includes(q)
    })
  }, [options, query])

  const updatePos = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 6
    const spaceBelow = window.innerHeight - r.bottom - gap
    const spaceAbove = r.top - gap
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow
    const maxHeight = Math.max(180, Math.min(360, openUp ? spaceAbove - 8 : spaceBelow - 8))
    setPos({
      top: openUp ? Math.max(8, r.top - gap) : r.bottom + gap,
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.min(r.width, window.innerWidth - 16) - 8)),
      width: Math.min(Math.max(r.width, 240), window.innerWidth - 16),
      maxHeight,
      openUp,
    })
  }

  useLayoutEffect(() => {
    if (!open || isMobile) return
    updatePos()
    const onScroll = () => updatePos()
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, isMobile])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: !isMobile }), 30)
    // Khoá scroll nền trên mobile khi mở sheet
    const prev = document.body.style.overflow
    if (isMobile) document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = prev
    }
  }, [open, isMobile])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
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

  const list = (
    <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
      {filtered.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted">{emptyText}</p>
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
                'flex w-full items-center gap-2 px-3 py-3 text-left text-sm transition sm:py-2.5',
                isActive && 'bg-accent-soft',
                isSelected && 'font-semibold text-accent',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block break-words">{opt.label}</span>
                {opt.hint && <span className="mt-0.5 block break-words text-xs text-muted">{opt.hint}</span>}
              </span>
              {isSelected && <Check size={16} className="shrink-0 text-accent" />}
            </button>
          )
        })
      )}
    </div>
  )

  const panel =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      isMobile ? (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end sm:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-ink/45"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="relative z-10 flex max-h-[min(88dvh,100%)] min-h-[50dvh] w-full flex-col rounded-t-3xl bg-card shadow-2xl animate-fade-up safe-bottom"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 pb-2 pt-3">
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold">{label || 'Chọn'}</p>
                <p className="text-[11px] text-muted">Gõ để tìm · {filtered.length}/{options.length}</p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold"
                onClick={() => setOpen(false)}
              >
                Đóng
              </button>
            </div>
            <div className="shrink-0 border-b border-line px-3 py-2">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
                <Search size={18} className="shrink-0 text-muted" />
                <input
                  ref={inputRef}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                {query && (
                  <button type="button" className="rounded-lg p-1 text-muted" onClick={() => setQuery('')} aria-label="Xoá">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            {list}
          </div>
        </div>
      ) : (
        pos && (
          <div
            ref={panelRef}
            className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-xl"
            style={{
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              ...(pos.openUp
                ? { bottom: window.innerHeight - pos.top, top: 'auto' }
                : { top: pos.top }),
            }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={searchPlaceholder}
                className="w-full min-w-0 bg-transparent py-1.5 text-base text-ink outline-none placeholder:text-muted/70"
                autoComplete="off"
              />
            </div>
            {list}
            {options.length > 8 && (
              <p className="shrink-0 border-t border-line px-3 py-1.5 text-[11px] text-muted">
                {filtered.length}/{options.length} · gõ để lọc nhanh
              </p>
            )}
          </div>
        )
      ),
      document.body,
    )

  return (
    <div ref={rootRef} className={cn('relative block space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      <button
        ref={triggerRef}
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
      {panel}
    </div>
  )
}
