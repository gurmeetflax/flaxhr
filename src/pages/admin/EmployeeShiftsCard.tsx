import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAssignShift, useEmployeeShifts, useRemoveEmployeeShift, useShifts } from '@/lib/shifts'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function shiftTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return format(new Date(2000, 0, 1, h, m), 'h:mm a')
}

// Shifts this employee can work. Late / early is measured against the
// day's roster entry, else the assigned shift starting closest to the
// punch-in, so rotating staff can hold several.
export default function EmployeeShiftsCard({ employeeId }: { employeeId: string }) {
  const { data: assigned = [] } = useEmployeeShifts(employeeId)
  const { data: shifts = [] } = useShifts(null)
  const assign = useAssignShift()
  const remove = useRemoveEmployeeShift()
  const [shiftId, setShiftId] = useState('')
  const [from, setFrom] = useState(format(new Date(), 'yyyy-MM-dd'))

  const today = format(new Date(), 'yyyy-MM-dd')
  const active = shifts.filter((s) => s.is_active)
  const daysOf = (id: string) => (shifts.find((s) => s.id === id)?.days_of_week ?? []).map((d) => DAY_LABELS[d]).join(' ')

  const onAdd = async () => {
    if (!shiftId) return
    try {
      await assign.mutateAsync({ employee_id: employeeId, shift_id: shiftId, effective_from: from })
      toast.success('Shift added')
      setShiftId('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const onEnd = async (a: (typeof assigned)[number]) => {
    try {
      // Ended assignments keep history for past reports; future ones are removed.
      if (a.effective_from > today) {
        await remove.mutateAsync(a)
      } else {
        await assign.mutateAsync({ ...pick(a), effective_to: today })
      }
      toast.success('Shift removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const current = assigned.filter((a) => !a.effective_to || a.effective_to >= today)
  const past = assigned.filter((a) => a.effective_to && a.effective_to < today)

  return (
    <div className="sm:col-span-2 grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div>
        <Label>Shifts</Label>
        <p className="text-xs text-muted-foreground">
          Add every shift this person works. Late and early are measured against the roster for the
          day, otherwise the shift whose start is closest to their punch-in.
        </p>
      </div>

      {current.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface text-sm">
          {current.map((a) => (
            <li key={`${a.shift_id}-${a.effective_from}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <div className="font-medium">
                  {a.shift_name} · {shiftTime(a.start_time)} – {shiftTime(a.end_time)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {daysOf(a.shift_id)} · from {format(parseISO(a.effective_from), 'd MMM yyyy')}
                  {a.effective_to ? ` to ${format(parseISO(a.effective_to), 'd MMM yyyy')}` : ''}
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => onEnd(a)} aria-label={`Remove ${a.shift_name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-amber-700">No shift assigned — late and early can't be measured.</p>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={shiftId}
          onChange={(e) => setShiftId(e.target.value)}
        >
          <option value="">Add a shift…</option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {shiftTime(s.start_time)} – {shiftTime(s.end_time)}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <Button type="button" onClick={onAdd} disabled={!shiftId} loading={assign.isPending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {past.length ? (
        <p className="text-xs text-muted-foreground">
          Earlier:{' '}
          {past
            .map((a) => `${a.shift_name} (${format(parseISO(a.effective_from), 'd MMM')} – ${format(parseISO(a.effective_to!), 'd MMM yyyy')})`)
            .join(', ')}
        </p>
      ) : null}
    </div>
  )
}

function pick(a: { employee_id: string; shift_id: string; effective_from: string }) {
  return { employee_id: a.employee_id, shift_id: a.shift_id, effective_from: a.effective_from }
}
