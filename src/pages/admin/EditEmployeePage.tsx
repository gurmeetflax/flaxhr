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
import { useDesignations } from '@/lib/designations'

interface Employee {
  id: string
  employee_code: string
  full_name: string
  phone: string | null
  work_email: string | null
  outlet_id: string | null
  is_active: boolean
  hired_on: string | null
  monthly_salary: number | null
  exit_date: string | null
  exit_reason: string | null
  designation_code: string | null
  date_of_birth: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
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
          'id, employee_code, full_name, phone, work_email, outlet_id, is_active, hired_on, monthly_salary, exit_date, exit_reason, designation_code, date_of_birth, address, emergency_contact_name, emergency_contact_phone',
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
  const designationsQ = useDesignations({ activeOnly: true })

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [outletId, setOutletId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [monthlySalary, setMonthlySalary] = useState('')
  const [exitDate, setExitDate] = useState('')
  const [exitReason, setExitReason] = useState('')
  const [designationCode, setDesignationCode] = useState('')
  const [dob, setDob] = useState('')
  const [address, setAddress] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!employeeQ.data) return
    const e = employeeQ.data
    setFullName(e.full_name ?? '')
    setPhone(e.phone ?? '')
    setWorkEmail(e.work_email ?? '')
    setOutletId(e.outlet_id ?? '')
    setIsActive(e.is_active)
    setMonthlySalary(e.monthly_salary != null ? String(e.monthly_salary) : '')
    setExitDate(e.exit_date ?? '')
    setExitReason(e.exit_reason ?? '')
    setDesignationCode(e.designation_code ?? '')
    setDob(e.date_of_birth ?? '')
    setAddress(e.address ?? '')
    setEmergencyName(e.emergency_contact_name ?? '')
    setEmergencyPhone(e.emergency_contact_phone ?? '')
  }, [employeeQ.data])

  const save = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No employee id')
      const cleanName = fullName.trim().replace(/\s+/g, ' ')
      const cleanPhone = phone.trim().replace(/\s+/g, '') || null
      const cleanEmail = workEmail.trim().toLowerCase() || null

      const salaryNum = monthlySalary.trim() === '' ? null : Number(monthlySalary)
      if (salaryNum != null && (Number.isNaN(salaryNum) || salaryNum < 0)) {
        throw new Error('Monthly salary must be a non-negative number.')
      }
      const patch = {
        full_name: cleanName,
        phone: cleanPhone,
        work_email: cleanEmail,
        outlet_id: outletId || null,
        is_active: isActive,
        monthly_salary: salaryNum,
        designation_code: designationCode || null,
        exit_date: exitDate || null,
        exit_reason: exitReason.trim() || null,
        date_of_birth: dob || null,
        address: address.trim() || null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
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
            <Field label="Designation">
              <select
                value={designationCode}
                onChange={(ev) => setDesignationCode(ev.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Unassigned</option>
                {(designationsQ.data ?? []).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Monthly salary (₹)">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={monthlySalary}
                onChange={(ev) => setMonthlySalary(ev.target.value)}
                placeholder="e.g. 25000"
              />
            </Field>
            <Field label="Exit date">
              <Input
                type="date"
                value={exitDate}
                onChange={(ev) => setExitDate(ev.target.value)}
              />
            </Field>
            <Field label="Exit reason">
              <Input
                value={exitReason}
                onChange={(ev) => setExitReason(ev.target.value)}
                placeholder="Resignation, terminated, …"
              />
            </Field>

            <Field label="Date of birth">
              <Input
                type="date"
                value={dob}
                onChange={(ev) => setDob(ev.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Address">
              <Input
                value={address}
                onChange={(ev) => setAddress(ev.target.value)}
                placeholder="Street, area, city"
              />
            </Field>
            <Field label="Emergency contact name">
              <Input
                value={emergencyName}
                onChange={(ev) => setEmergencyName(ev.target.value)}
                placeholder="Full name"
              />
            </Field>
            <Field label="Emergency contact phone">
              <Input
                type="tel"
                value={emergencyPhone}
                onChange={(ev) => setEmergencyPhone(ev.target.value)}
                placeholder="+91…"
              />
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

      <ResetPinCard employeeId={e.id} />
    </>
  )
}

function ResetPinCard({ employeeId }: { employeeId: string }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const reset = useMutation({
    mutationFn: async (newPin: string) => {
      const { error } = await supabase.rpc('reset_employee_pin', {
        p_employee_id: employeeId,
        p_new_pin: newPin,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('PIN reset')
      setPin('')
      setConfirm('')
    },
    onError: (e: Error) => {
      const msg = e.message.includes('INVALID_PIN')
        ? 'PIN must be exactly 6 digits.'
        : e.message.includes('FORBIDDEN')
          ? 'You do not have permission to reset PINs.'
          : e.message.includes('NO_AUTH_USER')
            ? 'This employee has no linked login.'
            : e.message
      setErr(msg)
      toast.error(msg)
    },
  })

  function onReset() {
    setErr(null)
    if (!/^[0-9]{6}$/.test(pin)) {
      setErr('PIN must be exactly 6 digits.')
      return
    }
    if (pin !== confirm) {
      setErr('PINs do not match.')
      return
    }
    reset.mutate(pin)
  }

  return (
    <Card className="mt-4">
      <CardContent className="p-6">
        <div className="mb-3">
          <Label className="text-base font-semibold">Reset login PIN</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Issues a new 6-digit PIN. Existing sessions remain valid until the
            user next logs in.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New PIN">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              onChange={(ev) => setPin(ev.target.value.replace(/\D/g, ''))}
              placeholder="6 digits"
            />
          </Field>
          <Field label="Confirm">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={confirm}
              onChange={(ev) => setConfirm(ev.target.value.replace(/\D/g, ''))}
              placeholder="6 digits"
            />
          </Field>
        </div>
        {err ? <p className="mt-3 text-sm text-destructive">{err}</p> : null}
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onReset}
            loading={reset.isPending}
            disabled={!pin || !confirm}
          >
            Reset PIN
          </Button>
        </div>
      </CardContent>
    </Card>
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
