import { useEffect, useId, useState } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  displayDateTimeToIso,
  displayDateToIso,
  isCompleteDateInput,
  isoDateTimeToDisplay,
  isoToDisplayDate,
} from '@/lib/dateInput'

function CalendarHit({
  isoDate,
  disabled,
  onPick,
}: {
  isoDate: string
  disabled?: boolean
  onPick: (iso: string) => void
}) {
  return (
    <span className="absolute right-1 top-1/2 size-10 -translate-y-1/2">
      <Calendar size={18} className="pointer-events-none absolute inset-0 m-auto text-muted" />
      <input
        type="date"
        tabIndex={-1}
        aria-label="Chọn trên lịch"
        disabled={disabled}
        value={isoDate || ''}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value)
        }}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </span>
  )
}

export function DateField({
  label,
  value,
  onChange,
  required,
  disabled,
  allowEmpty = false,
  className,
}: {
  label?: string
  /** yyyy-mm-dd hoặc rỗng */
  value: string
  onChange: (iso: string) => void
  required?: boolean
  disabled?: boolean
  allowEmpty?: boolean
  className?: string
}) {
  const id = useId()
  const [text, setText] = useState(() => isoToDisplayDate(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setText(isoToDisplayDate(value))
    setInvalid(false)
  }, [value])

  const commit = (raw: string) => {
    const iso = displayDateToIso(raw)
    if (iso === '') {
      if (allowEmpty && !required) {
        setInvalid(false)
        onChange('')
        setText('')
        return
      }
      setInvalid(true)
      setText(isoToDisplayDate(value))
      return
    }
    if (iso == null) {
      setInvalid(true)
      setText(isoToDisplayDate(value))
      return
    }
    setInvalid(false)
    setText(isoToDisplayDate(iso))
    onChange(iso)
  }

  return (
    <label className={cn('block space-y-1.5', className)}>
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder="DD/MM/YYYY"
          disabled={disabled}
          required={required}
          value={text}
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            setInvalid(false)
            if (raw.trim() === '' && allowEmpty && !required) {
              onChange('')
              return
            }
            if (!isCompleteDateInput(raw)) return
            const iso = displayDateToIso(raw)
            if (iso) onChange(iso)
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(text)
            }
          }}
          className={cn(
            'w-full min-w-0 rounded-xl border bg-white/80 px-3 py-2.5 pr-12 text-base text-ink placeholder:text-muted/70',
            invalid ? 'border-danger' : 'border-line',
          )}
        />
        <CalendarHit
          isoDate={value}
          disabled={disabled}
          onPick={(iso) => {
            onChange(iso)
            setText(isoToDisplayDate(iso))
            setInvalid(false)
          }}
        />
      </div>
      {invalid && <p className="text-xs text-danger">Ngày không hợp lệ. Dùng DD/MM/YYYY.</p>}
    </label>
  )
}

export function DateTimeField({
  label,
  value,
  onChange,
  required,
  disabled,
  className,
}: {
  label?: string
  /** yyyy-mm-ddTHH:mm */
  value: string
  onChange: (iso: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
}) {
  const [text, setText] = useState(() => isoDateTimeToDisplay(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setText(isoDateTimeToDisplay(value))
    setInvalid(false)
  }, [value])

  const commit = (raw: string) => {
    const iso = displayDateTimeToIso(raw)
    if (!iso) {
      setInvalid(true)
      setText(isoDateTimeToDisplay(value))
      return
    }
    setInvalid(false)
    setText(isoDateTimeToDisplay(iso))
    onChange(iso)
  }

  const datePart = (value.split('T')[0] || '')
  const timePart = (value.split('T')[1] || '12:00').slice(0, 5)

  return (
    <label className={cn('block space-y-1.5', className)}>
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <div className="relative">
        <input
          type="text"
          autoComplete="off"
          placeholder="DD/MM/YYYY HH:mm"
          disabled={disabled}
          required={required}
          value={text}
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            setInvalid(false)
            const iso = displayDateTimeToIso(raw)
            if (iso && (raw.includes(':') || raw.replace(/\D/g, '').length >= 12)) onChange(iso)
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(text)
            }
          }}
          className={cn(
            'w-full min-w-0 rounded-xl border bg-white/80 px-3 py-2.5 pr-12 text-base text-ink placeholder:text-muted/70',
            invalid ? 'border-danger' : 'border-line',
          )}
        />
        <CalendarHit
          isoDate={datePart}
          disabled={disabled}
          onPick={(iso) => {
            const next = `${iso}T${timePart}`
            onChange(next)
            setText(isoDateTimeToDisplay(next))
            setInvalid(false)
          }}
        />
      </div>
      {invalid && <p className="text-xs text-danger">Dùng DD/MM/YYYY HH:mm.</p>}
    </label>
  )
}
