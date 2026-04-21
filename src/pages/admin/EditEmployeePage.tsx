import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { isValidEmail } from '@/lib/identity'

interface Employee {
  id: string
  employee_code: string
  full_name: string
  phone: string | null
  work_email: string | null
  outlet_id: string | null
  is_active: boolean
  hired_on: string | null
}

interface OutletOption {
  id: string
  display_name: string | null
}

export default function EditEmployeePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const employeeQ = useQuery<Employee | null>({
    queryKey: ['employee', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('v_employees')
        .select(
          'id, employee_code, full_name, phone, work_email, outlet_id, is_active, hired_on',
        )
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as Employee) ?? null
    },
    enabled: !!id,
  })

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

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [outletId, setOutletId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!employeeQ.data) return
    const e = employeeQ.data
    setFullName(e.full_name ?? '')
    setPhone(e.phone ?? '')
    setWorkEmail(e.work_email ?? '')
    setOutletId(e.outlet_id ?? '')
    setIsActive(e.is_active)
  }, [employeeQ.data])

  const save = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No employee id')
      const cleanName = fullName.trim().replace(/\s+/g, ' ')
      const cleanPhone = phone.trim().replace(/\s+/g, '') || null
      const cleanEmail = workEmail.trim().toLowerCase() || null

      const patch = {
        full_name: cleanName,
        phone: cleanPhone,
        work_email: cleanEmail,
        outlet_id: outletId || null,
        is_active: isActive,
      }
      const { error } = await supabase
        .schema('core' as never)
        .from('employees')
        .update(patch)
        .eq('id', id)
      if (error) {
        if (error.code === '23505') {
          if (error.message.includes('phone'))
            throw new Error('That phone number is already in use.')
          if (error.message.includes('work_email'))
            throw new Error('That work email is already in use.')
        }
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees-list'] })
      qc.invalidateQueries({ queryKey: ['employee', id] })
      toast.success('Employee updated')
      navigate('/admin/employees')
    },
    onError: (e: Error) => {
      setErr(e.message)
      toast.error(e.message)
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!fullName.trim()) return setErr('Full name is required.')
    if (workEmail.trim() && !isValidEmail(workEmail.trim())) {
      return setErr('Work email looks invalid.')
    }
    if (!outletId) return setErr('Select an outlet.')
    save.mutate()
  }

  if (employeeQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    )
  }

  if (!employeeQ.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Employee not found.
        </CardContent>
      </Card>
    )
  }

  const e = employeeQ.data

  return (
    <>
      <PageHeader
        title={e.full_name}
        description={<span className="font-mono text-xs">{e.employee_code}</span>}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/employees')}>
            Back
          </Button>
        }
      />
      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Employee code</Label>
              <Input value={e.employee_code} disabled />
              <p className="text-xs text-muted-foreground">Codes are immutable once assigned.</p>
            </div>
            <Field label="Full name" required>
              <Input value={fullName} onChange={(ev) => setFullName(ev.target.value)} required />
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={phone}
                onChange={(ev) => setPhone(ev.target.value)}
                placeholder="+91…"
              />
            </Field>
            <Field label="Work email">
              <Input
                type="email"
                value={workEmail}
                onChange={(ev) => setWorkEmail(ev.target.value)}
                placeholder="firstname@flaxitup.com"
              />
            </Field>
            <Field label="Outlet" required>
              <select
                value={outletId}
                onChange={(ev) => setOutletId(ev.target.value)}
                required
                className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select…</option>
                {(outletsQ.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.display_name ?? o.id}
                  </option>
                ))}
              </select>
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <Label>Status</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(ev) => setIsActive(ev.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary"
                />
                Employee is active
              </label>
              {!isActive ? (
                <p className="text-xs text-warning">
                  Inactive employees won't appear in the default list and can't punch attendance.
                </p>
              ) : null}
            </div>

            {err ? <p className="sm:col-span-2 text-sm text-destructive">{err}</p> : null}

            <div className="sm:col-span-2 flex items-center gap-2 pt-2">
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/admin/employees')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  )
}
