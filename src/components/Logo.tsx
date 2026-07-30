export function Logo({ size = 'md', light = false }: { size?: 'sm' | 'md' | 'lg'; light?: boolean }) {
  const sizes = {
    sm: { box: 'h-9 w-9 text-sm', text: 'text-base' },
    md: { box: 'h-12 w-12 text-lg', text: 'text-xl' },
    lg: { box: 'h-16 w-16 text-2xl', text: 'text-3xl' },
  }
  const s = sizes[size]
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${s.box} relative flex items-center justify-center overflow-hidden rounded-2xl bg-ink font-display font-extrabold text-surface shadow-md`}
      >
        <span className="relative z-10">AP</span>
        <span className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-accent to-accent-hot" />
      </div>
      <div className="leading-none">
        <p className={`font-display font-extrabold tracking-tight ${s.text} ${light ? 'text-surface' : 'text-ink'}`}>
          AN PHÁT
        </p>
      </div>
    </div>
  )
}
