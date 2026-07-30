import { Input } from '@/components/ui'
import { formatMoneyFull, parseMoneyInput } from '@/lib/utils'

export function MoneyInput({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div>
      <Input
        label={label}
        type="text"
        inputMode="numeric"
        value={value ? String(value) : ''}
        disabled={disabled}
        onChange={(e) => onChange(parseMoneyInput(e.target.value))}
        placeholder="0"
      />
      {value > 0 && (
        <p className="mt-1 text-xs font-medium text-accent">{formatMoneyFull(value)}</p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}
