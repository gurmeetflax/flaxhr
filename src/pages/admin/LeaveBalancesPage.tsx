import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { humanErr } from '@/lib/humanErr'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import {
  useAccrueMonthlyLeaves,
  useAdjustLeaveBalance,
  useBackfillOpeningBalances,
  useEmployeeLeaveBalances,
  type EmployeeLeaveBalance,
} from '@/lib/leaveBalances'

interface Aggregated {
  employee_id: string
  employee_code: string
  employee_name: string
  outlet_id: string | null
  balances: Record<string, EmployeeLeaveBalance>
}

export default function LeaveBalancesPage() {
  const { data: rows = [], isLoading } = useEmployeeLeaveBalances()
  const [search, setSearch] = useState('')
  const [adjust, setAdjust] = useState<{
    employee: Aggregated
    types: EmployeeLeaveBalance[]
  } | null>(null)

  const accrue = useAccrueMonthlyLeaves()
  const backfill = useBackfillOpeningBalances()

  const aggregated = useMemo(() => {
    const byEmp = new Map<string, Aggregated>()
    const codes = new Set<string>()
    for (const r of rows) {
      codes.add(r.leave_code)
      const existing = byEmp.get(r.employee_id) ?? {
        employee_id: r.employee_id,
        employee_code: r.employee_code,
        employee_name: r.employee_name,
        outlet_id: r.outlet_id,
        balances: {},
      }
      existing.balances[r.leave_code] = r
      byEmp.set(r.employee_id, existing)
    }
    return {
      employees: Array.from(byEmp.values()),
      codes: Array.from(codes).sort(),
    }
  }, [rows])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return aggregated.employees
    return aggregated.employees.filter(
      (e) =>
        e.employee_name.toLowerCase().includes(needle) ||
        e.employee_code.toLowerCase().includes(needle),
    )
  }, [aggregated.employees, search])

  async function runAccrue() {
    try {
      const n = await accrue.mutateAsync(undefined)
      toast.success(`Accrual complete — ${n} credits`)
    } catch (e) {
      toast.error(humanErr(e, 'Accrual failed'))
    }
  }

  async function runBackfill() {
    if (
      !window.confirm(
        'Grant opening balances to every active employee who has never received one. Continue?',
      )
    )
      return
    try {
      const n = await backfill.mutateAsync()
      toast.success(`${n} opening credits granted`)
    } catch (e) {
      toast.error(humanErr(e, 'Backfill failed'))
    }
  }

  return (
    <>
      <PageHeader
        title="Leave balances"
        description={isLoading ? 'Loading…' : `${aggregated.employees.length} employees`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={runBackfill} loading={backfill.isPending}>
              Backfill openings
            </Button>
            <Button size="sm" onClick={runAccrue} loading={accrue.isPending}>
              Accrue this month
            </Button>
          </div>
        }
      />

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Search employee code or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  {aggregated.codes.map((c) => (
                    <th key={c} className="px-3 py-2 text-right tabular-nums">{c}</th>
                  ))}
                  <th className="px-3 py-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr key={e.employee_id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap font-mono">
                      {e.employee_code}
                    </td>
                    <td className="px-3 py-2">{e.employee_name}</td>
                    {aggregated.codes.map((c) => (
                      <td
                        key={c}
                        className={`px-3 py-2 text-right tabular-nums ${
                          (e.balances[c]?.balance ?? 0) <= 0 ? 'text-destructive' : ''
                        }`}
                      >
                        {e.balances[c] ? e.balances[c].balance.toFixed(2) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setAdjust({
                            employee: e,
                            types: aggregated.codes
                              .map((c) => e.balances[c])
                              .filter(Boolean) as EmployeeLeaveBalance[],
                          })
                        }
                      >
                        Adjust
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={aggregated.codes.length + 3} className="px-4 py-8 text-center text-muted-foreground">
                      No employees.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {adjust ? (
        <AdjustModal
          onClose={() => setAdjust(null)}
          employee={adjust.employee}
          types={adjust.types}
        />
      ) : null}
    </>
  )
}

function AdjustModal({
  onClose,
  employee,
  types,
}: {
  onClose: () => void
  employee: Aggregated
  types: EmployeeLeaveBalance[]
}) {
  const [leaveTypeId, setLeaveTypeId] = useState(types[0]?.leave_type_id ?? '')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [source, setSource] = useState<'manual_adjust' | 'encash' | 'carry_forward'>(
    'manual_adjust',
  )
  const adjust = useAdjustLeaveBalance()

  const type = types.find((t) => t.leave_type_id === leaveTypeId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(delta)
    if (!leaveTypeId) return toast.error('Pick a leave type')
    if (Number.isNaN(n) || n === 0) return toast.error('Delta must be non-zero')
    if (!reason.trim()) return toast.error('Reason is required')
    try {
      await adjust.mutateAsync({
        employee_id: employee.employee_id,
        leave_type_id: leaveTypeId,
        delta: n,
        reason: reason.trim(),
        source,
      })
      toast.success(`${employee.employee_code}: ${n > 0 ? '+' : ''}${n} ${type?.leave_code}`)
      onClose()
    } catch (err) {
      toast.error(humanErr(err, 'Failed'))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <CardTitle className="mb-1">Adjust balance</CardTitle>
        <CardDescription className="mb-4">
          {employee.employee_name} ({employee.employee_code})
        </CardDescription>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <Label className="text-xs">Leave type</Label>
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
              >
                {types.map((t) => (
                  <option key={t.leave_type_id} value={t.leave_type_id}>
                    {t.leave_name} ({t.leave_code}) · {t.balance.toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <Label className="text-xs">Source</Label>
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as 'manual_adjust' | 'encash' | 'carry_forward')
                }
              >
                <option value="manual_adjust">Correction</option>
                <option value="encash">Encash</option>
                <option value="carry_forward">Carry-forward</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <Label className="text-xs">Delta (+ or −, e.g. +2 or −0.5)</Label>
            <Input
              type="number"
              step="0.25"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="+2"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <Label className="text-xs">Reason (audit trail)</Label>
            <textarea
              className="min-h-[60px] rounded-lg border border-border bg-surface p-3 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Comp-off earned for weekend duty on 14 Jul"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={adjust.isPending}>
              Save adjustment
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
