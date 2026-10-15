import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Check, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type { RosterEntry } from '@/lib/roster'
import type { Shift } from '@/lib/shifts'
import {
  GROUP_LABEL,
  generateRoster,
  hhmm,
  normaliseShift,
  type RosterDraft,
  type RosterGroup,
} from '@/lib/autoRoster'
import {
  loadAutoRosterInputs,
  rulesInput,
  suggestFromOrders,
  useSaveDraft,
  useSaveStaffingSetup,
  useStaffingSetup,
  busiestFromOrders,
  type HourlyOrders,
  type RosterRules,
  type StaffingNeed,
} from '@/lib/autoRosterData'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const GROUPS = Object.keys(GROUP_LABEL) as RosterGroup[]

// One editable row: the same need on several weekdays.
interface NeedRow {
  key: string
  weekdays: number[]
  from: string
  to: string
  group: RosterGroup
  headcount: number
}

const t5 = (t: string) => t.slice(0, 5)

function toRows(needs: StaffingNeed[]): NeedRow[] {
  const map = new Map<string, NeedRow>()
  for (const n of needs) {
    const k = `${t5(n.block_start)}|${t5(n.block_end)}|${n.roster_group}|${n.headcount}`
    const row = map.get(k) ?? {
      key: k,
      weekdays: [],
      from: t5(n.block_start),
      to: t5(n.block_end),
      group: n.roster_group,
      headcount: n.headcount,
    }
    row.weekdays.push(n.weekday)
    map.set(k, row)
  }
  return [...map.values()].sort((a, b) => a.group.localeCompare(b.group) || a.from.localeCompare(b.from))
}

function toNeeds(outletId: string, rows: NeedRow[]): StaffingNeed[] {
  return rows.flatMap((r) =>
    r.weekdays.map((wd) => ({
      outlet_id: outletId,
      weekday: wd,
      block_start: r.from,
      block_end: r.to,
      roster_group: r.group,
      headcount: r.headcount,
    })),
  )
}

// ── Staffing needs + rules ───────────────────────────────────────────────
export function StaffingSetup({ outletId, onClose }: { outletId: string; onClose: () => void }) {
  const setup = useStaffingSetup(outletId)
  const save = useSaveStaffingSetup()
  if (!setup.data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <StaffingSetupForm
      key={outletId}
      outletId={outletId}
      initialRows={toRows(setup.data.needs)}
      initialRules={setup.data.rules}
      hourlyOrders={setup.data.hourlyOrders}
      fromOrders={setup.data.needsFromOrders}
      rulesSaved={setup.data.rulesSaved}
      saving={save.isPending}
      onClose={onClose}
      onSave={async (rows, rules) => {
        try {
          await save.mutateAsync({ outletId, needs: toNeeds(outletId, rows), rules })
          toast.success('Staffing needs saved')
          onClose()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Save failed')
        }
      }}
    />
  )
}

function StaffingSetupForm({
  outletId,
  initialRows,
  initialRules,
  hourlyOrders,
  fromOrders,
  rulesSaved,
  saving,
  onSave,
  onClose,
}: {
  outletId: string
  initialRows: NeedRow[]
  initialRules: RosterRules
  hourlyOrders: HourlyOrders[]
  fromOrders: boolean
  rulesSaved: boolean
  saving: boolean
  onSave: (rows: NeedRow[], rules: RosterRules) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<NeedRow[]>(initialRows)
  const [rules, setRules] = useState<RosterRules>(initialRules)
  const patch = (key: string, p: Partial<NeedRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const toggleDay = (list: number[], d: number) =>
    list.includes(d) ? list.filter((x) => x !== d) : [...list, d]
  const addRow = () =>
    setRows((rs) => [
      ...rs,
      {
        key: crypto.randomUUID(),
        weekdays: [1, 2, 3, 4, 5, 6, 0],
        from: '12:00',
        to: '15:00',
        group: 'kitchen',
        headcount: 1,
      },
    ])

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">Staffing needs</div>
          <p className="text-xs text-muted-foreground">
            How many people each role needs in each busy period. The auto roster fills shifts to cover these.
          </p>
          {fromOrders ? (
            <p className="mt-1 text-xs text-primary">
              Calculated from this outlet's Petpooja orders (last 8 weeks). Adjust anything and Save to keep
              your version, or leave it and it keeps following the orders.
            </p>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          Busiest days (no week offs)
          {hourlyOrders.length ? (
            <span className="text-[11px]">
              By orders:{' '}
              {busiestFromOrders(hourlyOrders)
                .map((d) => WEEKDAYS[d])
                .join(', ')}
              {rulesSaved ? '' : ' (used until you save)'}
            </span>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {WEEK_ORDER.map((d) => (
              <DayChip
                key={d}
                label={WEEKDAYS[d]}
                on={rules.busiest_days.includes(d)}
                onClick={() => setRules({ ...rules, busiest_days: toggleDay(rules.busiest_days, d) })}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumField
            label="Max off per day"
            value={rules.max_off_per_day}
            onChange={(v) => setRules({ ...rules, max_off_per_day: v })}
          />
          <NumField
            label="Experienced after (months)"
            value={rules.senior_months}
            onChange={(v) => setRules({ ...rules, senior_months: v })}
          />
          <NumField
            label="New joiner under (months)"
            value={rules.new_joiner_months}
            onChange={(v) => setRules({ ...rules, new_joiner_months: v })}
          />
          <NumField
            label="Orders per cook per hour"
            value={rules.orders_per_staff_hour}
            onChange={(v) => setRules({ ...rules, orders_per_staff_hour: Math.max(1, v) })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {rows.length ? (
          rows.map((r) => (
            <div
              key={r.key}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm"
            >
              <div className="flex flex-wrap gap-1">
                {WEEK_ORDER.map((d) => (
                  <DayChip
                    key={d}
                    label={WEEKDAYS[d][0]}
                    title={WEEKDAYS[d]}
                    on={r.weekdays.includes(d)}
                    onClick={() => patch(r.key, { weekdays: toggleDay(r.weekdays, d) })}
                  />
                ))}
              </div>
              <input
                type="time"
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                value={r.from}
                onChange={(e) => patch(r.key, { from: e.target.value })}
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="time"
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                value={r.to}
                onChange={(e) => patch(r.key, { to: e.target.value })}
              />
              <input
                type="number"
                min={0}
                max={50}
                className="h-9 w-16 rounded-md border border-border bg-surface px-2 text-sm"
                value={r.headcount}
                onChange={(e) => patch(r.key, { headcount: Math.max(0, Number(e.target.value) || 0) })}
              />
              <select
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                value={r.group}
                onChange={(e) => patch(r.key, { group: e.target.value as RosterGroup })}
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Remove"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No needs yet. Add rows like "Sat, Sun · 12:00 to 15:00 · 4 Kitchen".
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add busy period
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!hourlyOrders.length}
          title={
            hourlyOrders.length ? undefined : 'No Petpooja orders for this outlet in the last 8 weeks yet'
          }
          onClick={() => {
            const suggested = toRows(suggestFromOrders(outletId, hourlyOrders, rules.orders_per_staff_hour))
            setRows(suggested)
            toast.success('Recalculated from Petpooja orders — check and adjust before saving')
          }}
        >
          <Sparkles className="h-4 w-4" /> {fromOrders ? 'Recalculate' : 'Reset to Petpooja'}
        </Button>
        <span className="flex-1" />
        <Button size="sm" loading={saving} onClick={() => onSave(rows, rules)}>
          <Check className="h-4 w-4" /> Save
        </Button>
      </div>
      {!hourlyOrders.length ? (
        <p className="text-xs text-muted-foreground">
          No Petpooja orders for this outlet yet, so needs are entered by hand.
        </p>
      ) : null}
    </div>
  )
}

function DayChip({
  label,
  title,
  on,
  onClick,
}: {
  label: string
  title?: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'h-7 min-w-7 rounded-full px-2 text-xs font-medium',
        on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
      )}
    >
      {label}
    </button>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  )
}

// ── Auto-fill preview ────────────────────────────────────────────────────
export function AutoFill({
  outletId,
  days,
  shifts,
  roster,
  employees,
  onClose,
  onEditNeeds,
}: {
  outletId: string
  days: string[]
  shifts: Shift[]
  roster: RosterEntry[]
  employees: { id: string; full_name: string }[]
  onClose: () => void
  onEditNeeds: () => void
}) {
  const setup = useStaffingSetup(outletId)
  const saveDraft = useSaveDraft()
  const activeShifts = useMemo(() => shifts.filter((s) => s.is_active), [shifts])
  // Default: shifts this outlet already uses; otherwise all of them.
  const usedHere = useMemo(() => new Set(roster.map((r) => r.shift_id).filter(Boolean) as string[]), [roster])
  const [picked, setPicked] = useState<Set<string> | null>(null)
  // Nothing used yet: skip office shifts and ones saved with odd times.
  const chosen =
    picked ??
    (usedHere.size
      ? usedHere
      : new Set(
          activeShifts.filter((s) => !normaliseShift(s).adjusted && !/office/i.test(s.name)).map((s) => s.id),
        ))
  const [draft, setDraft] = useState<(RosterDraft & { skipped: string[] }) | null>(null)
  const [busy, setBusy] = useState(false)

  const needs = setup.data?.needs ?? []
  const shiftName = new Map(shifts.map((s) => [s.id, s.name.trim()]))

  const run = async () => {
    if (!setup.data) return
    setBusy(true)
    try {
      const use = activeShifts.filter((s) => chosen.has(s.id))
      const { staff, locked, skipped } = await loadAutoRosterInputs({
        outletId,
        days,
        shifts: use,
        roster,
        busiestDays: setup.data.rules.busiest_days,
      })
      const result = generateRoster({
        days,
        staff,
        shifts: use,
        needs: setup.data.needs,
        rules: rulesInput(setup.data.rules),
        locked,
      })
      setDraft({ ...result, skipped })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not build the roster')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!draft) return
    try {
      const n = await saveDraft.mutateAsync({ outletId, entries: draft.entries })
      toast.success(`${n} roster cells filled as a draft — review, then Publish week`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const cell = new Map(draft?.entries.map((e) => [`${e.employeeId}|${e.date}`, e]))
  const existing = new Map(roster.map((r) => [`${r.employee_id}|${r.work_date}`, r]))

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Wand2 className="h-4 w-4 text-primary" /> Auto roster
          </div>
          <p className="text-xs text-muted-foreground">
            A weekly roster: each person keeps one shift all week plus one week off (not on busiest days).
            Shifts cover the busy hours, every shift has an experienced person, new joiners work alongside
            them, and closing shifts are shared fairly. Only empty cells are filled.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {setup.data?.needsFromOrders ? (
        <div className="rounded-md bg-primary/10 p-2 text-xs text-primary">
          Using this outlet's busy hours from Petpooja (last 8 weeks, refreshed nightly)
          {setup.data.rulesSaved
            ? ''
            : `; busiest days: ${setup.data.rules.busiest_days.map((d) => WEEKDAYS[d]).join(', ')}`}
          . Change them under Staffing needs.
        </div>
      ) : null}
      {setup.data && !needs.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Set this outlet's staffing needs first.
          <Button size="sm" variant="outline" onClick={onEditNeeds}>
            Set staffing needs
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Shifts to use</span>
        <div className="flex flex-wrap gap-1">
          {activeShifts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                const next = new Set(chosen)
                if (next.has(s.id)) next.delete(s.id)
                else next.add(s.id)
                setPicked(next)
                setDraft(null)
              }}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs',
                chosen.has(s.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {s.name.trim()} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={run} loading={busy} disabled={!needs.length || !chosen.size}>
          <Wand2 className="h-4 w-4" /> {draft ? 'Rebuild' : 'Build draft'}
        </Button>
        <Button size="sm" variant="outline" onClick={onEditNeeds}>
          Staffing needs
        </Button>
        {draft ? (
          <Button size="sm" loading={saveDraft.isPending} onClick={save} disabled={!draft.entries.length}>
            <Check className="h-4 w-4" /> Save {draft.entries.length} cells as draft
          </Button>
        ) : null}
      </div>

      {draft ? (
        <>
          {draft.adjustedShifts.length ? (
            <Notice>
              Read as AM/PM mix-ups: {draft.adjustedShifts.map((s) => `${s.name} → ${s.used}`).join(', ')}.
              Fix them in Shifts.
            </Notice>
          ) : null}
          {draft.skipped.length ? (
            <Notice>
              Not rostered here (no designation, or a roaming role like area manager — set a roster group in
              Settings → Designations to include): {draft.skipped.join(', ')}.
            </Notice>
          ) : null}
          {draft.warnings.map((w) => (
            <Notice key={w}>{w}</Notice>
          ))}
          {draft.gaps.length ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm">
              <div className="font-medium text-destructive">Not enough people to cover the busy hours</div>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {draft.gaps.map((g) => (
                  <li key={g.group}>
                    <b>{GROUP_LABEL[g.group]}</b>: about {g.extraPeople} more{' '}
                    {g.extraPeople === 1 ? 'person' : 'people'} needed — {g.shortHours} of {g.neededHours}{' '}
                    person-hours this week aren't covered.
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Until then: borrow staff from a nearby outlet on the days below, or hire. Shifts are already
                chosen to cover opening to closing before adding extra hands at the rush.
              </p>
            </div>
          ) : null}
          {draft.shortfalls.length ? (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              <div className="mb-1 font-medium">Gaps by day:</div>
              <ul className="list-disc pl-4">
                {draft.shortfalls.map((s, i) => (
                  <li key={i} className={s.empty ? 'font-semibold' : undefined}>
                    {format(new Date(`${s.date}T00:00:00`), 'EEE d')} · {hhmm(s.from)}–{hhmm(s.to)} ·{' '}
                    {s.empty
                      ? `no ${GROUP_LABEL[s.group].toLowerCase()} staff on duty`
                      : `${s.short} ${GROUP_LABEL[s.group].toLowerCase()} short`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="-mx-3 overflow-x-auto sm:mx-0">
            <table className="min-w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Employee</th>
                  {days.map((d) => (
                    <th key={d} className="px-2 py-1">
                      {format(new Date(`${d}T00:00:00`), 'EEE d')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-2 py-1 font-medium">{e.full_name}</td>
                    {days.map((d) => {
                      const k = `${e.id}|${d}`
                      const n = cell.get(k)
                      const old = existing.get(k)
                      const text = n
                        ? n.off
                          ? 'Off'
                          : (shiftName.get(n.shiftId ?? '') ?? '')
                        : old
                          ? old.status === 'off'
                            ? 'Off'
                            : (old.shift_name ?? '')
                          : '—'
                      return (
                        <td
                          key={d}
                          title={n?.reason}
                          className={cn(
                            'whitespace-nowrap px-2 py-1',
                            n
                              ? n.off
                                ? 'bg-muted font-medium'
                                : 'bg-primary/10 font-medium'
                              : 'text-muted-foreground',
                          )}
                        >
                          {text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Highlighted cells are new. Grey text is already in the roster and stays as is.
          </p>
        </>
      ) : null}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
