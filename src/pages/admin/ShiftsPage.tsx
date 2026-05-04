import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  UNIVERSAL_OUTLET,
  useDeleteShift,
  useShifts,
  useUpsertShift,
  type Shift,
  type ShiftOutletFilter,
} from '@/lib/shifts'

interface OutletOption {
  id: string
  display_name: string | null
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ShiftsPage() {
  const [filter, setFilter] = useState<ShiftOutletFilter>(null)
  const outletsQ = useQuery<OutletOption[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select('id, display_name')
        .eq('active', true)
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
  })
  const { data: shifts = [] } = useShifts(filter)
  const upsert = useUpsertShift()
  const del = useDeleteShift()

  const [form, setForm] = useState<Partial<Shift>>({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    grace_in_minutes: 10,
    grace_out_minutes: 10,
    days_of_week: [1, 2, 3, 4, 5],
    is_active: true,
    outlet_id: null,
  })

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return
    try {
      await upsert.mutateAsync({
        outlet_id: form.outlet_id ?? null,
        name: form.name!,
        start_time: form.start_time!,
        end_time: form.end_time!,
        grace_in_minutes: form.grace_in_minutes ?? 10,
        grace_out_minutes: form.grace_out_minutes ?? 10,
        days_of_week: form.days_of_week ?? [1, 2, 3, 4, 5],
        is_active: true,
      })
      toast.success('Shift saved')
      setForm({ ...form, name: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const removeShift = async (id: string) => {
    if (!window.confirm('Delete this shift?')) return
    try {
      await del.mutateAsync(id)
      toast.success('Deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const toggleDay = (d: number) => {
    const cur = form.days_of_week ?? []
    setForm({
      ...form,
      days_of_week: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort(),
    })
  }

  const filterValue =
    filter === UNIVERSAL_OUTLET ? '__universal' : filter ?? '__all'

  return (
    <>
      <PageHeader
        title="Shifts"
        description="Universal templates apply to every outlet; outlet-specific ones override only at that outlet."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Show
          <select
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            value={filterValue}
            onChange={(e) => {
              const v = e.target.value
              setFilter(v === '__all' ? null : v === '__universal' ? UNIVERSAL_OUTLET : v)
            }}
          >
            <option value="__all">All shifts</option>
            <option value="__universal">Universal only</option>
            {outletsQ.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name ?? o.id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Applies to
          <select
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            value={form.outlet_id ?? '__universal'}
            onChange={(e) => {
              const v = e.target.value
              setForm({ ...form, outlet_id: v === '__universal' ? null : v })
            }}
          >
            <option value="__universal">All outlets (universal)</option>
            {outletsQ.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name ?? o.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>Add / update shift</CardTitle>
            <form onSubmit={create} className="flex flex-col gap-3">
              <Input
                placeholder="Shift name (e.g. Morning)"
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Start
                  <Input
                    type="time"
                    value={form.start_time ?? '09:00'}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  End
                  <Input
                    type="time"
                    value={form.end_time ?? '18:00'}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Grace in (min)
                  <Input
                    type="number"
                    value={form.grace_in_minutes ?? 10}
                    onChange={(e) => setForm({ ...form, grace_in_minutes: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Grace out (min)
                  <Input
                    type="number"
                    value={form.grace_out_minutes ?? 10}
                    onChange={(e) => setForm({ ...form, grace_out_minutes: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, i) => {
                  const on = (form.days_of_week ?? []).includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={
                        'rounded-full px-3 py-1 text-xs font-medium ' +
                        (on
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground')
                      }
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <Button type="submit" loading={upsert.isPending}>
                <Plus className="h-4 w-4" /> Save shift
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>Existing shifts</CardTitle>
            {shifts.length === 0 ? (
              <CardDescription>None yet.</CardDescription>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {shifts.map((s) => {
                  const outletName = s.outlet_id
                    ? outletsQ.data?.find((o) => o.id === s.outlet_id)?.display_name ?? s.outlet_id
                    : null
                  return (
                    <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-medium">
                          {s.name}
                          {s.outlet_id === null ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              <Globe2 className="h-3 w-3" /> Universal
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {outletName}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} ·{' '}
                          {(s.days_of_week ?? []).map((d) => DAY_LABELS[d]).join(' ')}
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeShift(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
