import { CheckCircle2 } from 'lucide-react'

/** Green tick next to a name: finished every module assigned to them. */
export default function DoneTick({
  show,
  className = '',
}: {
  show: boolean | null | undefined
  className?: string
}) {
  if (!show) return null
  return (
    <CheckCircle2
      className={`inline h-4 w-4 shrink-0 align-[-3px] text-emerald-600 ${className}`}
      aria-label="Finished all training"
    >
      <title>Finished all training</title>
    </CheckCircle2>
  )
}
