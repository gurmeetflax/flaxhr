import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, UserX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface EmployeeRow {
  id: string
  employee_code: string
  full_name: string
  phone: string | null
  work_email: string | null
  outlet_id: string | null
  outlet_name: string | null
  outlet_city: string | null
  is_active: boolean
}

interface OutletOption {
  id: string
  display_name: string | null
}

export default function EmployeesListPage() {
  const [q, setQ] = useState('')
  const [outletFilter, setOutletFilter] = useState<string>('')
  const [inactiveVisible, setInactiveVisible] = useState(false)

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

  const employeesQ = useQuery<EmployeeRow[]>({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select(
          'id, employee_code, full_name, phone, work_email, outlet_id, outlet_name, outlet_city, is_active',
        )
        .order('employee_code', { ascending: true })
      if (error) throw error
      return (data as unknown as EmployeeRow[]) ?? []
    },
  })

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (employeesQ.data ?? []).filter((e) => {
      if (!inactiveVisible && !e.is_active) return false
      if (outletFilter && e.outlet_id !== outletFilter) return false
      if (!needle) return true
      return (
        e.employee_code.toLowerCase().includes(needle) ||
        e.full_name.toLowerCase().includes(needle) ||
        (e.phone ?? '').toLowerCase().includes(needle) ||
        (e.work_email ?? '').toLowerCase().includes(needle)
      )
    })
  }, [employeesQ.data, q, outletFilter, inactiveVisible])

  return (
    <>
      <PageHeader
        title="Employees"
        description={
          employeesQ.data
            ? `${filtered.length} of ${employeesQ.data.length} shown`
            : 'Loading…'
        }
        actions={
          <Link to="/admin/employees/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New employee
            </Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by code, name, phone, email"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All outlets</option>
          {(outletsQ.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name ?? o.id}
            </option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={inactiveVisible}
            onChange={(e) => setInactiveVisible(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary"
          />
          Show inactive
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {employeesQ.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading employees…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <UserX className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">
                {employeesQ.data && employeesQ.data.length === 0
                  ? 'No employees yet. Create the first one.'
                  : 'No employees match this filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Outlet</th>
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{e.employee_code}</td>
                      <td className="px-4 py-3 font-medium">{e.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.outlet_name ?? (
                          <span className="italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.work_email ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-medium',
                            e.is_active
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {e.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/admin/employees/${e.id}`}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
