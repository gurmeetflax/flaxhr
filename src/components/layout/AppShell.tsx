import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Leaf, LogOut } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { useAuth, useMyEmployee, useMyRoles } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
}

export default function AppShell({ nav, title }: { nav: NavItem[]; title: string }) {
  const { user, signOut } = useAuth()
  const { data: employee } = useMyEmployee()
  const { data: roles = [] } = useMyRoles()
  const navigate = useNavigate()

  const primaryRole = roles[0]?.role
  const displayName = employee?.full_name ?? user?.email ?? 'Flax user'

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar nav={nav} title={title} />
      <div className="pl-60">
        <Header
          name={displayName}
          role={primaryRole ?? 'user'}
          onSignOut={handleSignOut}
        />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Sidebar({ nav, title }: { nav: NavItem[]; title: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 w-60 border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <Leaf className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold leading-tight">Flax HR</div>
          <div className="text-xs text-muted-foreground">{title}</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

function Header({
  name,
  role,
  onSignOut,
}: {
  name: string
  role: string
  onSignOut: () => void
}) {
  return (
    <header className="flex h-16 items-center justify-end gap-3 border-b border-border bg-surface px-6">
      <div className="text-right leading-tight">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs capitalize text-muted-foreground">{role}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onSignOut}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </header>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  )
}
