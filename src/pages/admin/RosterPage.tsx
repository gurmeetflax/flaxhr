import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, startOfWeek } from 'date-fns'
import { FileDown, Globe2, MessageCircle, Save, Send, Undo2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useRoster, useSaveRosterCells, usePublishWeek, type RosterEntry } from '@/lib/roster'
import { useHasRole } from '@/lib/auth'
import { useShifts } from '@/lib/shifts'
import {
  clock,
  loadOutletRosterRows,
  renderRosterPng,
  rosterPdf,
  shareRosterFile,
  shareRosterPng,
} from '@/lib/rosterImage'
import { AutoFill, StaffingSetup } from './AutoRosterPanel'

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

  const days = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(weekStart), i), 'yyyy-MM-dd'))
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
      <PageHeader title="Roster" description="Plan shifts per outlet · week view" />

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
              setWeekStart(format(startOfWeek(new Date(e.target.value), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
            }
          />
          <span className="text-xs text-muted-foreground">
            {fromDate} → {toDate}
          </span>
          <AllOutletsPdfButton outlets={outletsQ.data ?? []} days={days} weekStart={fromDate} />
        </div>
      </div>

      {outletId === ALL_OUTLETS ? (
        outletsQ.data && outletsQ.data.length > 0 ? (
          <div className="grid gap-6">
            {outletsQ.data.map((o) => (
              <OutletRoster
                key={`${o.id}|${fromDate}`}
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
          key={`${outletId}|${fromDate}`}
          outletId={outletId}
          outletName={outletsQ.data?.find((o) => o.id === outletId)?.display_name ?? outletId}
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
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
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
  const saveCells = useSaveRosterCells()
  const publish = usePublishWeek()
  const canAutoRoster = useHasRole(['admin', 'hr'])

  // The outlet's own staff, plus anyone rostered here this week as cover.
  const own = employeesQ.data ?? []
  const ownIds = new Set(own.map((e) => e.id))
  const visitors = [
    ...new Map(
      roster
        .filter((r) => !ownIds.has(r.employee_id))
        .map((r) => [
          r.employee_id,
          {
            id: r.employee_id,
            full_name: `${r.employee_name} (cover)`,
            employee_code: r.employee_code,
            outlet_id: null,
          },
        ]),
    ).values(),
  ]
  const people: EmployeeOption[] = [...own, ...visitors]

  const byEmpDay = new Map<string, RosterEntry>()
  for (const r of roster) byEmpDay.set(`${r.employee_id}|${r.work_date}`, r)

  // Edits stay on screen until Save; nothing is written per dropdown.
  const [pending, setPending] = useState<Map<string, string>>(new Map())
  const cellValue = (entry: RosterEntry | undefined) =>
    entry?.shift_id ?? (entry?.status === 'off' ? '__off' : '')
  const setCell = (employeeId: string, workDate: string, value: string) => {
    const k = `${employeeId}|${workDate}`
    setPending((prev) => {
      const next = new Map(prev)
      if (value === cellValue(byEmpDay.get(k))) next.delete(k)
      else next.set(k, value)
      return next
    })
  }
  const savePending = async () => {
    if (!pending.size) return true
    try {
      await saveCells.mutateAsync(
        [...pending.entries()].map(([k, v]) => {
          const [employee_id, work_date] = k.split('|')
          return {
            outlet_id: outletId,
            employee_id,
            work_date,
            shift_id: v === '__off' || v === '' ? null : v,
            status: v === '__off' ? ('off' as const) : ('planned' as const),
          }
        }),
      )
      toast.success(`Saved ${pending.size} change${pending.size === 1 ? '' : 's'}`)
      setPending(new Map())
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
      return false
    }
  }
  useEffect(() => {
    if (!pending.size) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending.size])

  const [panel, setPanel] = useState<'auto' | 'needs' | null>(null)
  const [sharing, setSharing] = useState(false)
  const onShare = async () => {
    if (pending.size) return toast.error('Save your changes first')
    setSharing(true)
    try {
      const shiftById = new Map(shifts.map((s) => [s.id, s]))
      const rows = [...people]
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map((e) => ({
          name: e.full_name,
          cells: days.map((d) => {
            const entry = byEmpDay.get(`${e.id}|${d}`)
            if (entry?.status === 'off') return { label: 'Off', time: '', off: true }
            const s = entry?.shift_id ? shiftById.get(entry.shift_id) : undefined
            return s
              ? { label: s.name, time: clock(s.start_time) + ' – ' + clock(s.end_time) }
              : { label: '', time: '' }
          }),
        }))
      const png = await renderRosterPng({ outletName, days, rows })
      const how = await shareRosterPng(png, outletName, fromDate)
      if (how === 'link') toast.success('Opening WhatsApp with the roster image link')
      if (how === 'downloaded') toast.success('Roster image downloaded — attach it in WhatsApp')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not share the roster')
    } finally {
      setSharing(false)
    }
  }

  const onPublish = async () => {
    if (!(await savePending())) return
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{outletName}</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canAutoRoster}
              title={canAutoRoster ? undefined : 'Auto roster is run by admin / HR'}
              onClick={() => setPanel(panel === 'auto' ? null : 'auto')}
            >
              <Wand2 className="h-4 w-4" /> Auto roster
            </Button>
            <Button size="sm" variant="outline" onClick={onShare} loading={sharing}>
              <MessageCircle className="h-4 w-4" /> Send to WhatsApp
            </Button>
            <Button size="sm" onClick={onPublish} loading={publish.isPending}>
              <Send className="h-4 w-4" /> Publish week
            </Button>
          </div>
        </div>

        {pending.size ? (
          <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
            <span>
              {pending.size} unsaved change{pending.size === 1 ? '' : 's'}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPending(new Map())}>
                <Undo2 className="h-4 w-4" /> Discard
              </Button>
              <Button size="sm" loading={saveCells.isPending} onClick={() => void savePending()}>
                <Save className="h-4 w-4" /> Save changes
              </Button>
            </span>
          </div>
        ) : null}

        {panel === 'needs' && canAutoRoster ? (
          <StaffingSetup outletId={outletId} onClose={() => setPanel('auto')} />
        ) : panel === 'auto' && canAutoRoster ? (
          <AutoFill
            outletId={outletId}
            days={days}
            shifts={shifts}
            roster={roster}
            employees={[...(employeesQ.data ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name))}
            onClose={() => setPanel(null)}
            onEditNeeds={() => setPanel('needs')}
          />
        ) : null}

        {shifts.length === 0 ? (
          <CardDescription>
            No shifts defined for this outlet — go to Shifts and add one (or a universal template).
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
              {people.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground">{e.employee_code}</div>
                  </td>
                  {days.map((d) => {
                    const entry = byEmpDay.get(`${e.id}|${d}`)
                    const edited = pending.get(`${e.id}|${d}`)
                    return (
                      <td key={d} className="px-2 py-2">
                        <select
                          className={cn(
                            'h-9 w-full rounded-md border bg-surface px-2 text-xs',
                            edited !== undefined ? 'border-primary ring-1 ring-primary' : 'border-border',
                          )}
                          value={edited ?? cellValue(entry)}
                          onChange={(ev) => setCell(e.id, d, ev.target.value)}
                        >
                          <option value="">—</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.start_time.slice(0, 5)})
                            </option>
                          ))}
                          <option value="__off">Off</option>
                        </select>
                        {entry?.status === 'published' && edited === undefined ? (
                          <span className="mt-1 block text-[10px] text-primary">published</span>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {employeesQ.data && people.length === 0 ? (
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
  )
}

// Every outlet's week as one PDF (a page per outlet), shared to WhatsApp.
function AllOutletsPdfButton({
  outlets,
  days,
  weekStart,
}: {
  outlets: OutletOption[]
  days: string[]
  weekStart: string
}) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const pages: Blob[] = []
      for (const o of outlets) {
        const rows = await loadOutletRosterRows(o.id, days)
        if (!rows.length) continue
        pages.push(await renderRosterPng({ outletName: o.display_name ?? o.id, days, rows }))
      }
      const pdf = await rosterPdf(pages)
      const how = await shareRosterFile(
        pdf,
        `flax-roster-all-outlets-${weekStart}.pdf`,
        `Flax roster — all outlets, week of ${format(new Date(`${weekStart}T00:00:00`), 'd MMM')}`,
      )
      if (how === 'link') toast.success('Opening WhatsApp with the roster PDF link')
      if (how === 'downloaded') toast.success('Roster PDF downloaded — attach it in WhatsApp')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make the PDF')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={run} loading={busy} disabled={!outlets.length}>
      <FileDown className="h-4 w-4" /> All outlets PDF → WhatsApp
    </Button>
  )
}
