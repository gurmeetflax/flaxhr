import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface SignaturePadHandle {
  isEmpty: () => boolean
  toDataUrl: () => string
  clear: () => void
}

// Finger / mouse signature on a canvas. Exports a transparent PNG.
export default function SignaturePad({ ref }: { ref: Ref<SignaturePadHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvas.current!
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => empty,
    toDataUrl: () => canvas.current!.toDataURL('image/png'),
    clear: () => {
      const c = canvas.current!
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
      setEmpty(true)
    },
  }))

  return (
    <div className="flex flex-col gap-1">
      <div className="relative rounded-lg border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvas}
          className="h-36 w-full touch-none"
          onPointerDown={(e) => {
            drawing.current = true
            last.current = pos(e)
            canvas.current!.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return
            const p = pos(e)
            const ctx = canvas.current!.getContext('2d')!
            ctx.beginPath()
            ctx.moveTo(last.current.x, last.current.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
            last.current = p
            if (empty) setEmpty(false)
          }}
          onPointerUp={() => {
            drawing.current = false
            last.current = null
          }}
        />
        {empty ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-zinc-400">
            Sign here with your finger
          </span>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const c = canvas.current!
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
            setEmpty(true)
          }}
        >
          <Eraser className="h-4 w-4" /> Clear
        </Button>
      </div>
    </div>
  )
}
