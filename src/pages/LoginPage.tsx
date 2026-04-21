import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, useMyRoles } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { employeeCodeToEmail, isFlaxitupEmail, normaliseEmployeeCode } from '@/lib/identity'

export default function LoginPage() {
  const { user } = useAuth()
  const { data: roles } = useMyRoles()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!user || !roles) return
    const from = (location.state as { from?: string } | null)?.from
    const isAdminish = roles.some((r) => ['admin', 'hr', 'manager', 'auditor'].includes(r.role))
    navigate(from ?? (isAdminish ? '/admin' : '/me'), { replace: true })
  }, [user, roles, navigate, location.state])

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
            <Leaf className="h-5 w-5" />
          </span>
          <div>
            <div className="text-base font-semibold leading-tight">Flax HR</div>
            <div className="text-xs text-muted-foreground">Sign in to continue</div>
          </div>
        </div>

        <Tabs defaultValue="employee" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="employee">Employee</TabsTrigger>
            <TabsTrigger value="admin">Admin / HR</TabsTrigger>
          </TabsList>

          <TabsContent value="employee">
            <EmployeeForm />
          </TabsContent>
          <TabsContent value="admin">
            <AdminForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function AdminForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!isFlaxitupEmail(email)) {
      setErr('Admin sign in requires a @flaxitup.com email.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-soft">
      <div className="space-y-2">
        <Label htmlFor="admin-email">Email</Label>
        <Input
          id="admin-email"
          type="email"
          autoComplete="email"
          placeholder="you@flaxitup.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-password">Password</Label>
        <Input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <Button type="submit" loading={busy} className="w-full">
        Sign in
      </Button>
    </form>
  )
}

function EmployeeForm() {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    const normalised = normaliseEmployeeCode(code)
    if (!/^FLX-[A-Z0-9]{2,6}-[0-9]{4}$/.test(normalised)) {
      setErr('Employee code must look like FLX-BND-0001.')
      return
    }
    if (!/^[0-9]{6}$/.test(pin)) {
      setErr('PIN must be exactly 6 digits.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: employeeCodeToEmail(normalised),
      password: pin,
    })
    setBusy(false)
    if (error) setErr('Invalid employee code or PIN.')
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-soft">
      <div className="space-y-2">
        <Label htmlFor="emp-code">Employee code</Label>
        <Input
          id="emp-code"
          placeholder="FLX-BND-0001"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="emp-pin">6-digit PIN</Label>
        <Input
          id="emp-pin"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          required
        />
      </div>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <Button type="submit" loading={busy} className="w-full">
        Sign in
      </Button>
      <p className="text-xs text-muted-foreground">
        Forgot your PIN? Ask your outlet manager to reset it.
      </p>
    </form>
  )
}
