import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, startOfWeek } from 'date-fns'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useRoster, useUpsertRosterEntry, usePublishWeek, type RosterEntry } from '@/lib/roster'
import { useShifts } from '@/lib/shifts'

interface OutletOption { id: string; display_name: string | null }
interface EmployeeOption { id: string; full_name: string; employee_code: string; outlet_id: string | null }

export default function RosterPage() {
  const [outletId, setOutletId] = useState('')
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))

  const days = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(weekStart), i), 'yyyy-MM-dd'))
  const fromDate = days[0]
  const toDate = days[6]

  const outletsQ = useQuery<OutletOption[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase.from('flax_outlets').select('id, display_name').eq('active', true).order('display_name')
      if (error) throw error
      return data ?? []
    },
  })

  const employeesQ = useQuery<EmployeeOption[]>({
    queryKey: ['outlet-employees', outletId],
    enabled: !!outletId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, full_name, employee_code, outlet_id')
        .eq('outlet_id', outletId)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as EmployeeOption[]
    },
  })

  const { data: shifts = [] } = useShifts(outletId || null)
  const { data: roster = [] } = useRoster(outletId || null, fromDate, toDate)
  const upsert = useUpsertRosterEntry()
  const publish = usePublishWeek()

  const byEmpDay = new Map<string, RosterEntry>()
  for (const r of roster) byEmpDay.set(`${r.employee_id}|${r.work_date}`, r)

  const setShift = async (employeeId: string, work_date: string, shiftId: string) => {
    try {
      await upsert.mutateAsync({
        outlet_id: outletId,
        employee_id: employeeId,
        work_date,
        shift_id: shiftId === '__off' ? null : shiftId === '__clear' ? null : shiftId,
        status: shiftId === '__off' ? 'off' : 'planned',
      })
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const onPublish = async () => {
    try {
      await publish.mutateAsync({ outletId, fromDate, toDate })
      toast.success('Week published')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <>
      <PageHeader
        title="Roster"
        description="Plan shifts per outlet · week view"
        actions={
          <Button size="sm" onClick={onPublish} disabled={!outletId} loading={publish.isPending}>
            <Send className="h-4 w-4" /> Publish week
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
        >
          <option value="">— Select outlet —</option>
          {outletsQ.data?.map((o) => (
            <option key={o.id} value={o.id}>{o.display_name ?? o.id}</option>
          ))}
        </select>
        <input
          type="date"
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={weekStart}
          onChange={(e) => setWeekStart(format(startOfWeek(new Date(e.target.value), { weekStartsOn: 1 }), 'yyyy-MM-dd'))}
        />
        <span className="self-center text-sm text-muted-foreground">
          {fromDate} → {toDate}
        </span>
      </div>

      {!outletId ? (
        <Card>
          <CardContent className="p-6">
            <CardDescription>Pick an outlet to plan its roster.</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    {days.map((d) => (
                      <th key={d} className="px-3 py-2">{format(new Date(d), 'EEE d')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {employeesQ.data?.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{e.full_name}</div>
                        <div className="text-xs text-muted-foreground">{e.employee_code}</div>
                      </td>
                      {days.map((d) => {
                        const entry = byEmpDay.get(`${e.id}|${d}`)
                        return (
                          <td key={d} className="px-2 py-2">
                            <select
                              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-xs"
                              value={entry?.shift_id ?? (entry?.status === 'off' ? '__off' : '')}
                              onChange={(ev) => setShift(e.id, d, ev.target.value)}
                            >
                              <option value="">—</option>
                              {shifts.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.start_time.slice(0, 5)})
                                </option>
                              ))}
                              <option value="__off">Off</option>
                            </select>
                            {entry?.status === 'published' ? (
                              <span className="mt-1 block text-[10px] text-primary">published</span>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {employeesQ.data?.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        No active employees at this outlet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {shifts.length === 0 && outletId ? (
        <Card className="mt-4">
          <CardContent className="p-6">
            <CardTitle>No shifts defined</CardTitle>
            <CardDescription className="mt-1">
              Define shifts in the Shifts page before rostering.
            </CardDescription>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
