import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { isValidEmail } from '@/lib/identity'
import { useDesignations } from '@/lib/designations'
import {
  getSignedKycUrl,
  useUpdateKycLast4,
  useUploadKyc,
  useVerifyKyc,
  type KycKind,
  type KycStatus,
} from '@/lib/kyc'
import { useEmployeeOutlets, useSetEmployeeOutlets } from '@/lib/employeeOutlets'

interface Employee {
  id: string
  employee_code: string
  first_name: string | null
  last_name: string | null
  full_name: string
  phone: string | null
  personal_email: string | null
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
  home_lat: number | null
  home_lng: number | null
  aadhaar_last4: string | null
  pan_last4: string | null
  kyc_status: 'pending' | 'submitted' | 'verified' | 'rejected'
  kyc_verified_at: string | null
  kyc_notes: string | null
  selfie_required: boolean | null
  pf_enabled: boolean
  pt_enabled: boolean
  esic_enabled: boolean
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
          'id, employee_code, first_name, last_name, full_name, phone, personal_email, outlet_id, is_active, hired_on, monthly_salary, exit_date, exit_reason, designation_code, date_of_birth, address, emergency_contact_name, emergency_contact_phone, home_lat, home_lng, aadhaar_last4, pan_last4, kyc_status, kyc_verified_at, kyc_notes, selfie_required, pf_enabled, pt_enabled, esic_enabled',
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

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [personalEmail, setPersonalEmail] = useState('')
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
  const [homeLat, setHomeLat] = useState('')
  const [homeLng, setHomeLng] = useState('')
  // 'inherit' = null, 'always' = true, 'never' = false
  const [selfieMode, setSelfieMode] = useState<'inherit' | 'always' | 'never'>('inherit')
  const [pfEnabled, setPfEnabled] = useState(false)
  const [ptEnabled, setPtEnabled] = useState(false)
  const [esicEnabled, setEsicEnabled] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!employeeQ.data) return
    const e = employeeQ.data
    setFirstName(e.first_name ?? '')
    setLastName(e.last_name ?? '')
    setPhone(e.phone ?? '')
    setPersonalEmail(e.personal_email ?? '')
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
    setHomeLat(e.home_lat != null ? String(e.home_lat) : '')
    setHomeLng(e.home_lng != null ? String(e.home_lng) : '')
    setSelfieMode(
      e.selfie_required === true ? 'always' :
      e.selfie_required === false ? 'never' : 'inherit'
    )
    setPfEnabled(!!e.pf_enabled)
    setPtEnabled(!!e.pt_enabled)
    setEsicEnabled(!!e.esic_enabled)
  }, [employeeQ.data])

  const save = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No employee id')
      const cleanFirst = firstName.trim().replace(/\s+/g, ' ')
      const cleanLast = lastName.trim().replace(/\s+/g, ' ')
      const cleanPhone = phone.trim().replace(/\s+/g, '') || null
      const cleanEmail = personalEmail.trim().toLowerCase() || null

      const salaryNum = monthlySalary.trim() === '' ? null : Number(monthlySalary)
      if (salaryNum != null && (Number.isNaN(salaryNum) || salaryNum < 0)) {
        throw new Error('Monthly salary must be a non-negative number.')
      }
      const patch = {
        first_name: cleanFirst,
        last_name: cleanLast,
        phone: cleanPhone,
        personal_email: cleanEmail,
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
        home_lat: homeLat.trim() === '' ? null : Number(homeLat),
        home_lng: homeLng.trim() === '' ? null : Number(homeLng),
        selfie_required:
          selfieMode === 'always' ? true :
          selfieMode === 'never' ? false : null,
        pf_enabled: pfEnabled,
        pt_enabled: ptEnabled,
        esic_enabled: esicEnabled,
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
          if (error.message.includes('personal_email'))
            throw new Error('That email is already in use.')
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
    if (!firstName.trim()) return setErr('First name is required.')
    if (!lastName.trim()) return setErr('Last name is required.')
    if (personalEmail.trim() && !isValidEmail(personalEmail.trim())) {
      return setErr('Personal email looks invalid.')
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
            <Field label="First name" required>
              <Input value={firstName} onChange={(ev) => setFirstName(ev.target.value)} required />
            </Field>
            <Field label="Last name" required>
              <Input value={lastName} onChange={(ev) => setLastName(ev.target.value)} required />
            </Field>
            <Field label="Phone" required>
              <Input
                type="tel"
                value={phone}
                onChange={(ev) => setPhone(ev.target.value)}
                placeholder="+91…"
                required
              />
            </Field>
            <Field label="Personal email" required>
              <Input
                type="email"
                value={personalEmail}
                onChange={(ev) => setPersonalEmail(ev.target.value)}
                placeholder="firstname@example.com"
                required
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
            <Field label="Designation" required>
              <select
                value={designationCode}
                onChange={(ev) => setDesignationCode(ev.target.value)}
                required
                className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select…</option>
                {(designationsQ.data ?? []).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Monthly salary (₹)" required>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={monthlySalary}
                onChange={(ev) => setMonthlySalary(ev.target.value)}
                placeholder="e.g. 25000"
                required
              />
            </Field>

            <Field label="Date of birth" required>
              <Input
                type="date"
                value={dob}
                onChange={(ev) => setDob(ev.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Address" required>
              <Input
                value={address}
                onChange={(ev) => setAddress(ev.target.value)}
                placeholder="Street, area, city"
                required
              />
            </Field>
            <Field label="Emergency contact name" required>
              <Input
                value={emergencyName}
                onChange={(ev) => setEmergencyName(ev.target.value)}
                placeholder="Full name"
                required
              />
            </Field>
            <Field label="Emergency contact phone" required>
              <Input
                type="tel"
                value={emergencyPhone}
                onChange={(ev) => setEmergencyPhone(ev.target.value)}
                placeholder="+91…"
                required
              />
            </Field>

            <div className="sm:col-span-2 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Home location <span className="text-destructive">*</span></Label>
                <button
                  type="button"
                  onClick={() => {
                    if (!('geolocation' in navigator)) return
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setHomeLat(pos.coords.latitude.toFixed(6))
                        setHomeLng(pos.coords.longitude.toFixed(6))
                        toast.success('Captured location')
                      },
                      (err) => toast.error(err.message),
                      { enableHighAccuracy: true, timeout: 10000 },
                    )
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  📍 Use my current location
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={homeLat}
                  onChange={(ev) => setHomeLat(ev.target.value)}
                  placeholder="Latitude (e.g. 12.9716)"
                  required
                />
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={homeLng}
                  onChange={(ev) => setHomeLng(ev.target.value)}
                  placeholder="Longitude (e.g. 77.5946)"
                  required
                />
              </div>
              {homeLat && homeLng ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${homeLat}&mlon=${homeLng}#map=16/${homeLat}/${homeLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in map
                </a>
              ) : null}
            </div>

            {employeeQ.data ? <KycCard employee={employeeQ.data} /> : null}
            {employeeQ.data ? (
              <ExtraOutletsCard
                employeeId={employeeQ.data.id}
                primaryOutletId={employeeQ.data.outlet_id}
                allOutlets={outletsQ.data ?? []}
              />
            ) : null}

            <div className="sm:col-span-2 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label>Selfie on punch</Label>
              <p className="text-xs text-muted-foreground">
                Override the global "Require selfie" setting for this employee.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(['inherit', 'always', 'never'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelfieMode(m)}
                    className={
                      'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ' +
                      (selfieMode === m
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-muted-foreground hover:border-primary/50')
                    }
                  >
                    {m === 'inherit' ? 'Default (use global)' : m === 'always' ? 'Always required' : 'Never required'}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label>Statutory deductions</Label>
              <p className="text-xs text-muted-foreground">
                Applied automatically by payroll. Rates live in Settings.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pfEnabled}
                    onChange={(e) => setPfEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary"
                  />
                  PF (Provident Fund)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ptEnabled}
                    onChange={(e) => setPtEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary"
                  />
                  PT (Professional Tax)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={esicEnabled}
                    onChange={(e) => setEsicEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary"
                  />
                  ESIC (only if gross ≤ ₹21,000)
                </label>
              </div>
            </div>

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
      <DangerZoneCard employeeId={e.id} fullName={e.full_name} />
    </>
  )
}

function ExtraOutletsCard({
  employeeId,
  primaryOutletId,
  allOutlets,
}: {
  employeeId: string
  primaryOutletId: string | null
  allOutlets: OutletOption[]
}) {
  const { data: rows = [] } = useEmployeeOutlets(employeeId)
  const setOutlets = useSetEmployeeOutlets()

  const extras = rows.filter((r) => !r.is_primary)
  const extraIds = new Set(extras.map((r) => r.outlet_id))
  const allowed = allOutlets.filter((o) => o.id !== primaryOutletId)

  async function toggle(outletId: string) {
    const next = extraIds.has(outletId)
      ? Array.from(extraIds).filter((id) => id !== outletId)
      : [...Array.from(extraIds), outletId]
    try {
      await setOutlets.mutateAsync({ employee_id: employeeId, outlet_ids: next })
      toast.success('Updated outlets')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <div className="sm:col-span-2 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <div>
        <Label>Also covers (extra outlets)</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Employees can punch + be rostered at any of these. The home outlet (above) is automatic.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {allowed.length === 0 ? (
          <span className="text-xs text-muted-foreground">No other outlets to add.</span>
        ) : (
          allowed.map((o) => {
            const on = extraIds.has(o.id)
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                disabled={setOutlets.isPending}
                className={
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                  (on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-muted-foreground hover:border-primary/50')
                }
              >
                {o.display_name ?? o.id}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function KycCard({ employee }: { employee: Employee }) {
  const upload = useUploadKyc()
  const verify = useVerifyKyc()
  const updateLast4 = useUpdateKycLast4()

  const [aadhaarLast4, setAadhaarLast4] = useState(employee.aadhaar_last4 ?? '')
  const [panLast4, setPanLast4] = useState(employee.pan_last4 ?? '')
  const [notes, setNotes] = useState(employee.kyc_notes ?? '')

  useEffect(() => {
    setAadhaarLast4(employee.aadhaar_last4 ?? '')
    setPanLast4(employee.pan_last4 ?? '')
    setNotes(employee.kyc_notes ?? '')
  }, [employee.id, employee.aadhaar_last4, employee.pan_last4, employee.kyc_notes])

  async function onUpload(kind: KycKind, file: File | null) {
    if (!file) return
    try {
      await upload.mutateAsync({ employee_id: employee.id, kind, file })
      toast.success(`${kind.toUpperCase()} uploaded`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  async function onView(kind: KycKind) {
    try {
      const url = await getSignedKycUrl(employee.id, kind, 60)
      if (!url) {
        toast.error('No document on file')
        return
      }
      window.open(url, '_blank')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not get URL')
    }
  }

  async function onVerify(status: KycStatus) {
    try {
      await verify.mutateAsync({ employee_id: employee.id, status, notes: notes.trim() || undefined })
      toast.success(`KYC ${status}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function onSaveLast4() {
    const a = aadhaarLast4.trim()
    const p = panLast4.trim().toUpperCase()
    if (a && !/^[0-9]{4}$/.test(a)) {
      toast.error('Aadhaar last-4 must be 4 digits')
      return
    }
    if (p && !/^[A-Z0-9]{4}$/.test(p)) {
      toast.error('PAN last-4 must be 4 alphanumeric chars')
      return
    }
    try {
      await updateLast4.mutateAsync({
        employee_id: employee.id,
        aadhaar_last4: a || null,
        pan_last4: p || null,
      })
      toast.success('Saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <div className="sm:col-span-2 grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>KYC</Label>
        <KycStatusPill status={employee.kyc_status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <KycRow
          kind="aadhaar"
          label="Aadhaar"
          last4={aadhaarLast4}
          setLast4={setAadhaarLast4}
          onUpload={(f) => onUpload('aadhaar', f)}
          onView={() => onView('aadhaar')}
        />
        <KycRow
          kind="pan"
          label="PAN"
          last4={panLast4}
          setLast4={setPanLast4}
          onUpload={(f) => onUpload('pan', f)}
          onView={() => onView('pan')}
        />
      </div>

      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Verification notes (optional)"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onSaveLast4}>
          Save last-4
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onVerify('verified')}
          loading={verify.isPending}
        >
          Mark verified
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onVerify('rejected')}
          className="text-destructive hover:text-destructive"
        >
          Reject
        </Button>
        {employee.kyc_verified_at ? (
          <span className="text-xs text-muted-foreground">
            Verified {new Date(employee.kyc_verified_at).toLocaleDateString()}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function KycRow({
  label,
  last4,
  setLast4,
  onUpload,
  onView,
}: {
  kind: KycKind
  label: string
  last4: string
  setLast4: (s: string) => void
  onUpload: (file: File) => void
  onView: () => void
}) {
  return (
    <div className="rounded border border-border bg-surface p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <Input
        value={last4}
        onChange={(e) => setLast4(e.target.value)}
        placeholder="Last 4 digits"
        maxLength={4}
        className="mb-2"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="cursor-pointer text-primary hover:underline">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ''
            }}
          />
          Upload file
        </label>
        <button type="button" onClick={onView} className="text-primary hover:underline">
          View
        </button>
      </div>
    </div>
  )
}

function KycStatusPill({ status }: { status: 'pending' | 'submitted' | 'verified' | 'rejected' }) {
  const map: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    submitted: 'bg-warning/10 text-warning',
    verified: 'bg-primary/10 text-primary',
    rejected: 'bg-destructive/10 text-destructive',
  }
  return (
    <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + (map[status] ?? map.pending)}>
      {status}
    </span>
  )
}

function DangerZoneCard({ employeeId, fullName }: { employeeId: string; fullName: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: async () => {
      // Soft-delete: hide from directory, mark inactive, demote roles.
      const stamp = new Date().toISOString()
      const { error: e1 } = await supabase
        .schema('core' as never)
        .from('employees')
        .update({ deleted_at: stamp, is_active: false })
        .eq('id', employeeId)
      if (e1) throw e1

      // Soft-delete role rows so the user can't sign in or be looked up.
      const { data: emp } = await supabase
        .schema('core' as never)
        .from('employees')
        .select('user_id')
        .eq('id', employeeId)
        .maybeSingle()
      const userId = (emp as { user_id: string | null } | null)?.user_id
      if (userId) {
        await supabase
          .schema('core' as never)
          .from('user_roles')
          .update({ deleted_at: stamp })
          .eq('user_id', userId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees-list'] })
      toast.success('Employee deleted')
      navigate('/admin/employees', { replace: true })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Card className="mt-4 border-destructive/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Soft-deletes the employee. They disappear from the directory and can no longer sign in. Their attendance, leave, and payslip history is retained for audit.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={remove.isPending}
          onClick={() => {
            if (confirm(`Delete ${fullName}? This hides them from the directory and revokes login. History is retained. Continue?`)) {
              remove.mutate()
            }
          }}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete employee
        </Button>
      </CardContent>
    </Card>
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
