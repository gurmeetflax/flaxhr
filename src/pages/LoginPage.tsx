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
  const [googleBusy, setGoogleBusy] = useState(false)

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

  async function onGoogle() {
    setErr(null)
    setGoogleBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: {
          hd: 'flaxitup.com',
          prompt: 'select_account',
        },
      },
    })
    if (error) {
      setErr(error.message)
      setGoogleBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-soft">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogle}
        loading={googleBusy}
      >
        <GoogleLogo /> Continue with Google
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative mx-auto block w-max bg-surface px-2 text-xs uppercase tracking-widest text-muted-foreground">
          or
        </span>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            autoComplete="email"
            placeholder="you@flaxitup.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          />
        </div>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
        <Button type="submit" loading={busy} variant="secondary" className="w-full">
          Sign in with password
        </Button>
      </form>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
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
