const shapePoints = {
  triangle: '50,5 95,90 5,90',
  diamond: '50,4 96,50 50,96 4,50',
  star: '50,4 61,36 95,36 68,56 78,90 50,70 22,90 32,56 5,36 39,36',
  hexagon: '25,7 75,7 96,50 75,93 25,93 4,50',
}

function BoardingCodeBadge({ code, size = 72, className = '' }) {
  if (!code?.color || !code?.shape || code.number == null) return null

  const shape = code.shape
  const shapeElement = shape === 'circle'
    ? <circle cx="50" cy="50" r="44" fill={code.color} />
    : shape === 'square'
      ? <rect x="7" y="7" width="86" height="86" rx="8" fill={code.color} />
      : <polygon points={shapePoints[shape]} fill={code.color} />

  return (
    <span
      className={`boarding-code-badge ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label={`Boarding code ${code.number}`}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
        {shapeElement}
        <text x="50" y="57" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="38" fontWeight="700" fontFamily="var(--font-display)">{code.number}</text>
      </svg>
    </span>
  )
}

export default BoardingCodeBadge
