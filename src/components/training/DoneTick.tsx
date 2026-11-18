// Blue "verified" tick next to a name: finished every module assigned to them.
const POINTS = (() => {
  const pts: string[] = []
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 10.2 : 12
    const a = (Math.PI * i) / 12 - Math.PI / 2
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
})()

export default function DoneTick({
  show,
  className = '',
  size = 16,
}: {
  show: boolean | null | undefined
  className?: string
  size?: number
}) {
  if (!show) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline shrink-0 align-[-3px] ${className}`}
      role="img"
      aria-label="Finished all training"
    >
      <title>Finished all training</title>
      <polygon points={POINTS} fill="#1d74f5" stroke="#1d74f5" strokeWidth={1.2} strokeLinejoin="round" />
      <path
        d="M7.2 12.4l3.1 3.1 6.5-6.9"
        fill="none"
        stroke="#fff"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
