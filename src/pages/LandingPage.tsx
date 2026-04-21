import { Leaf } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Leaf className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Flax HR</span>
          </div>
          <nav className="text-sm text-muted-foreground">v0.1.0</nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Flax Healthy Living
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            HR, attendance and payroll — across every outlet.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Onboarding, selfie-based attendance with geofence, rosters, leave and payroll for the
            Flax outlet network. This is the foundation app for the shared Flax employee data.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <div
              key={m.title}
              className="rounded-xl border border-border bg-surface p-5 shadow-soft"
            >
              <h3 className="text-sm font-semibold">{m.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

const modules = [
  { title: 'Employees', desc: 'Onboarding, documents, statutory IDs and compensation.' },
  { title: 'Attendance', desc: 'Selfie punch in/out with outlet geofence.' },
  { title: 'Rosters', desc: 'Weekly shift planning per outlet with conflict checks.' },
  { title: 'Leave', desc: 'Balances, requests and approval chain.' },
  { title: 'Payroll', desc: 'Monthly salary, PF, ESIC and TDS with configurable statutory rules.' },
  { title: 'Admin', desc: 'Roles, outlets, statutory config, audit trail.' },
]
