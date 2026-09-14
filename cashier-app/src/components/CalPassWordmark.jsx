function CalPassWordmark({ compact = false }) {
  const iconSize = compact ? 22 : 30
  const wordmarkSize = compact ? '1.05rem' : '1.75rem'

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? '7px' : '10px' }}>
      <svg
        width={iconSize}
        height={Math.round(iconSize * 0.7)}
        viewBox="0 0 30 21"
        role="img"
        aria-label="CalPass bus"
        style={{ display: 'block', flex: '0 0 auto' }}
      >
        <rect x="1" y="1" width="28" height="14" rx="3" fill="none" stroke="var(--accent)" strokeWidth="2" />
        <path d="M5 6h14M5 10h4M13 10h6" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="17" r="2.5" fill="var(--accent)" />
        <circle cx="23" cy="17" r="2.5" fill="var(--accent)" />
      </svg>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: wordmarkSize, fontWeight: 600, lineHeight: 1 }}>CalPass</span>
    </div>
  )
}

export default CalPassWordmark
