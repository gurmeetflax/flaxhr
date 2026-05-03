import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useDeleteShift, useShifts, useUpsertShift, type Shift } from '@/lib/shifts'

interface OutletOption {
  id: string
  display_name: string | null
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ShiftsPage() {
  const [outletId, setOutletId] = useState('')
  const outletsQ = useQuery<OutletOption[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase.from('flax_outlets').select('id, display_name').eq('active', true).order('display_name')
      if (error) throw error
      return data ?? []
    },
  })
  const { data: shifts = [] } = useShifts(outletId || null)
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
  })

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!outletId) {
      toast.error('Pick an outlet first')
      return
    }
    if (!form.name) return
    try {
      await upsert.mutateAsync({
        outlet_id: outletId,
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

  return (
    <>
      <PageHeader title="Shifts" description="Define shift templates per outlet" />

      <div className="mb-4 max-w-md">
        <select
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
        >
          <option value="">— Select outlet —</option>
          {outletsQ.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name ?? o.id}
            </option>
          ))}
        </select>
      </div>

      {outletId ? (
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
                          (on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
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
                  {shifts.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} ·{' '}
                          {(s.days_of_week ?? []).map((d) => DAY_LABELS[d]).join(' ')}
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeShift(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <CardDescription>Pick an outlet above to manage its shifts.</CardDescription>
          </CardContent>
        </Card>
      )}
    </>
  )
}
