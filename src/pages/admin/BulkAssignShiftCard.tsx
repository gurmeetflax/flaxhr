import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAssignShift, useEmployeeShifts, type Shift } from '@/lib/shifts'
import { shiftTime } from './EmployeeShiftsCard'

interface Emp {
  id: string
  employee_code: string
  full_name: string
  outlet_id: string | null
  outlet_name: string | null
}

// Give one shift to many people at once. Adds to whatever shifts they
// already have — nothing is replaced.
export default function BulkAssignShiftCard({
  shifts,
  outlets,
}: {
  shifts: Shift[]
  outlets: { id: string; display_name: string | null }[]
}) {
  const [shiftId, setShiftId] = useState('')
  const [from, setFrom] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [outletId, setOutletId] = useState('')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const assign = useAssignShift()
  const { data: assigned = [] } = useEmployeeShifts(null)

  const empQ = useQuery<Emp[]>({
    queryKey: ['shift-assign-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, employee_code, full_name, outlet_id, outlet_name')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as Emp[]
    },
  })

  const today = format(new Date(), 'yyyy-MM-dd')
  const currentBy = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of assigned) {
      if (a.effective_to && a.effective_to < today) continue
      m.set(a.employee_id, [...(m.get(a.employee_id) ?? []), a.shift_name])
    }
    return m
  }, [assigned, today])

  const needle = search.trim().toLowerCase()
  const visible = (empQ.data ?? []).filter(
    (e) =>
      (!outletId || (outletId === '__none' ? !e.outlet_id : e.outlet_id === outletId)) &&
      (!needle || e.full_name.toLowerCase().includes(needle) || e.employee_code.toLowerCase().includes(needle)),
  )
  const allVisiblePicked = visible.length > 0 && visible.every((e) => picked.has(e.id))
  const unassigned = (empQ.data ?? []).filter((e) => !currentBy.has(e.id)).length

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const onAssign = async () => {
    if (!shiftId || !picked.size) return
    try {
      await assign.mutateAsync([...picked].map((employee_id) => ({ employee_id, shift_id: shiftId, effective_from: from })))
      toast.success(`Shift added to ${picked.size} employee${picked.size === 1 ? '' : 's'}`)
      setPicked(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col gap-3 p-6">
        <div>
          <CardTitle>Assign a shift to employees</CardTitle>
          <CardDescription className="mt-1">
            Adds the shift alongside any they already have — people who rotate can hold several.{' '}
            {unassigned ? <b className="text-amber-700">{unassigned} active employees have no shift yet.</b> : null}
          </CardDescription>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
          >
            <option value="">Choose shift…</option>
            {shifts
              .filter((s) => s.is_active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {shiftTime(s.start_time)} – {shiftTime(s.end_time)}
                </option>
              ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <select
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
          >
            <option value="">All outlets</option>
            <option value="__none">No outlet</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name ?? o.id}
              </option>
            ))}
          </select>
          <Input placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          <label className="sticky top-0 flex items-center gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={allVisiblePicked}
              onChange={() =>
                setPicked((p) => {
                  const n = new Set(p)
                  for (const e of visible) {
                    if (allVisiblePicked) n.delete(e.id)
                    else n.add(e.id)
                  }
                  return n
                })
              }
            />
            Select all shown ({visible.length})
          </label>
          <ul className="divide-y divide-border text-sm">
            {visible.map((e) => {
              const cur = currentBy.get(e.id)
              return (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                    <span className="flex-1">
                      <span className="font-medium">{e.full_name}</span>{' '}
                      <span className="text-xs text-muted-foreground">
                        {e.employee_code} · {e.outlet_name ?? 'No outlet'}
                      </span>
                    </span>
                    <span className={`text-xs ${cur ? 'text-muted-foreground' : 'text-amber-700'}`}>
                      {cur ? cur.join(', ') : 'No shift'}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>

        <div>
          <Button onClick={onAssign} disabled={!shiftId || !picked.size} loading={assign.isPending}>
            <UserPlus className="h-4 w-4" /> Assign to {picked.size || ''} selected
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
