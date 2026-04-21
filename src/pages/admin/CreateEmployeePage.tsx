import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createEphemeralClient, supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { employeeCodeToEmail, normaliseEmployeeCode } from '@/lib/identity'

interface Outlet {
  id: string
  display_name: string | null
  name: string
}

export default function CreateEmployeePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const outletsQ = useQuery<Outlet[]>({
    queryKey: ['outlets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select('id, display_name, name')
        .eq('active', true)
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
  })

  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [outletId, setOutletId] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)

    const normalised = normaliseEmployeeCode(code)
    if (!/^FLX-[A-Z0-9]{2,6}-[0-9]{4}$/.test(normalised)) {
      setErr('Code must be FLX-<OUTLET>-<NNNN> (e.g. FLX-BND-0001).')
      return
    }
    if (!/^[0-9]{6}$/.test(pin)) {
      setErr('PIN must be exactly 6 digits.')
      return
    }
    if (!fullName.trim()) {
      setErr('Full name is required.')
      return
    }
    if (!outletId) {
      setErr('Select an outlet.')
      return
    }

    setBusy(true)
    try {
      // 1. Create auth user on an ephemeral client so the ADMIN's current
      //    session is untouched. supabase.auth.signUp would otherwise replace
      //    the caller's session with the new employee's — knocking us to /me.
      const tmp = createEphemeralClient()
      const { data: signUp, error: signUpErr } = await tmp.auth.signUp({
        email: employeeCodeToEmail(normalised),
        password: pin,
      })
      if (signUpErr) throw signUpErr
      const userId = signUp.user?.id
      if (!userId) throw new Error('Sign-up returned no user.')

      // 2. Insert employees row linked to this auth user.
      const { error: empErr } = await supabase
        .schema('core' as never)
        .from('employees')
        .insert({
          employee_code: normalised,
          user_id: userId,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          outlet_id: outletId,
        })
      if (empErr) throw empErr

      // 3. Grant the 'employee' role (scoped to outlet).
      const { error: roleErr } = await supabase
        .schema('core' as never)
        .from('user_roles')
        .insert({ user_id: userId, role: 'employee', outlet_id: outletId })
      if (roleErr) throw roleErr

      qc.invalidateQueries({ queryKey: ['admin-dashboard-counts'] })
      navigate('/admin', { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create employee.'
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="New employee"
        description="Minimal test create. Full onboarding form lands with the Employees module."
      />
      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
            <Field label="Employee code" required>
              <Input
                placeholder="FLX-BND-0001"
                value={code}
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </Field>
            <Field label="Full name" required>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
              />
            </Field>
            <Field label="Outlet" required>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                required
                className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select…</option>
                {(outletsQ.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.display_name ?? o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="6-digit PIN" required>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </Field>

            {err ? (
              <p className="sm:col-span-2 text-sm text-destructive">{err}</p>
            ) : null}

            <div className="sm:col-span-2 flex items-center gap-2 pt-2">
              <Button type="submit" loading={busy}>
                Create employee
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/admin')}>
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
