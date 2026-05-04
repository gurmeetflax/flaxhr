import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, startOfWeek } from 'date-fns'
import { Globe2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useRoster, useUpsertRosterEntry, usePublishWeek, type RosterEntry } from '@/lib/roster'
import { useShifts } from '@/lib/shifts'

interface OutletOption {
  id: string
  display_name: string | null
}
interface EmployeeOption {
  id: string
  full_name: string
  employee_code: string
  outlet_id: string | null
}

const ALL_OUTLETS = '__all' as const

export default function RosterPage() {
  const [outletId, setOutletId] = useState<string>('')
  const [weekStart, setWeekStart] = useState(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  )

  const days = Array.from({ length: 7 }, (_, i) =>
    format(addDays(new Date(weekStart), i), 'yyyy-MM-dd'),
  )
  const fromDate = days[0]
  const toDate = days[6]

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

  // Default to the first outlet once outlets load.
  useEffect(() => {
    if (!outletId && outletsQ.data && outletsQ.data.length > 0) {
      setOutletId(outletsQ.data[0].id)
    }
  }, [outletId, outletsQ.data])

  return (
    <>
      <PageHeader
        title="Roster"
        description="Plan shifts per outlet · week view"
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          <OutletPill
            label="All outlets"
            icon
            active={outletId === ALL_OUTLETS}
            onClick={() => setOutletId(ALL_OUTLETS)}
          />
          {outletsQ.data?.map((o) => (
            <OutletPill
              key={o.id}
              label={o.display_name ?? o.id}
              active={outletId === o.id}
              onClick={() => setOutletId(o.id)}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            value={weekStart}
            onChange={(e) =>
              setWeekStart(
                format(
                  startOfWeek(new Date(e.target.value), { weekStartsOn: 1 }),
                  'yyyy-MM-dd',
                ),
              )
            }
          />
          <span className="text-xs text-muted-foreground">
            {fromDate} → {toDate}
          </span>
        </div>
      </div>

      {outletId === ALL_OUTLETS ? (
        outletsQ.data && outletsQ.data.length > 0 ? (
          <div className="grid gap-6">
            {outletsQ.data.map((o) => (
              <OutletRoster
                key={o.id}
                outletId={o.id}
                outletName={o.display_name ?? o.id}
                days={days}
                fromDate={fromDate}
                toDate={toDate}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <CardDescription>No outlets yet.</CardDescription>
            </CardContent>
          </Card>
        )
      ) : outletId ? (
        <OutletRoster
          outletId={outletId}
          outletName={
            outletsQ.data?.find((o) => o.id === outletId)?.display_name ?? outletId
          }
          days={days}
          fromDate={fromDate}
          toDate={toDate}
        />
      ) : (
        <Card>
          <CardContent className="p-6">
            <CardDescription>Pick an outlet to plan its roster.</CardDescription>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function OutletPill({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon?: boolean
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/70',
      )}
    >
      {icon ? <Globe2 className="h-3 w-3" /> : null}
      {label}
    </button>
  )
}

function OutletRoster({
  outletId,
  outletName,
  days,
  fromDate,
  toDate,
}: {
  outletId: string
  outletName: string
  days: string[]
  fromDate: string
  toDate: string
}) {
  const employeesQ = useQuery<EmployeeOption[]>({
    queryKey: ['outlet-employees', outletId],
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

  const { data: shifts = [] } = useShifts(outletId)
  const { data: roster = [] } = useRoster(outletId, fromDate, toDate)
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
        shift_id: shiftId === '__off' || shiftId === '' ? null : shiftId,
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
      toast.success(`Published — ${outletName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{outletName}</CardTitle>
          <Button
            size="sm"
            onClick={onPublish}
            loading={publish.isPending}
          >
            <Send className="h-4 w-4" /> Publish week
          </Button>
        </div>

        {shifts.length === 0 ? (
          <CardDescription>
            No shifts defined for this outlet — go to Shifts and add one (or a
            universal template).
          </CardDescription>
        ) : null}

        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Employee</th>
                {days.map((d) => (
                  <th key={d} className="px-3 py-2">
                    {format(new Date(d), 'EEE d')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employeesQ.data?.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.employee_code}
                    </div>
                  </td>
                  {days.map((d) => {
                    const entry = byEmpDay.get(`${e.id}|${d}`)
                    return (
                      <td key={d} className="px-2 py-2">
                        <select
                          className="h-9 w-full rounded-md border border-border bg-surface px-2 text-xs"
                          value={
                            entry?.shift_id ?? (entry?.status === 'off' ? '__off' : '')
                          }
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
                          <span className="mt-1 block text-[10px] text-primary">
                            published
                          </span>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {employeesQ.data?.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No active employees at this outlet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
