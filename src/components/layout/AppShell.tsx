import { useState, type ComponentType, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Leaf, LogOut, Menu, X } from 'lucide-react'
import { useAuth, useMyEmployee, useMyRoles } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import NotificationBell from '@/components/NotificationBell'

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
  const [drawerOpen, setDrawerOpen] = useState(false)

  const primaryRole = roles[0]?.role
  const displayName = employee?.full_name ?? user?.email ?? 'Flax user'

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen min-h-[100svh] bg-background">
      {drawerOpen ? (
        <button
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      ) : null}
      <Sidebar
        nav={nav}
        title={title}
        drawerOpen={drawerOpen}
        onNavigate={() => setDrawerOpen(false)}
      />
      <div className="md:pl-60">
        <Header
          name={displayName}
          role={primaryRole ?? 'user'}
          onSignOut={handleSignOut}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main
          className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8"
          style={{
            paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
          }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Sidebar({
  nav,
  title,
  drawerOpen,
  onNavigate,
}: {
  nav: NavItem[]
  title: string
  drawerOpen: boolean
  onNavigate: () => void
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-surface transition-transform md:translate-x-0',
        drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <Leaf className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">Flax HR</div>
            <div className="text-xs text-muted-foreground">{title}</div>
          </div>
        </div>
        <button
          aria-label="Close menu"
          onClick={onNavigate}
          className="rounded p-1 text-muted-foreground hover:bg-muted md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            onClick={onNavigate}
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
  onOpenDrawer,
}: {
  name: string
  role: string
  onSignOut: () => void
  onOpenDrawer: () => void
}) {
  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:justify-end md:px-6">
      <button
        aria-label="Open menu"
        onClick={onOpenDrawer}
        className="rounded p-2 text-muted-foreground hover:bg-muted md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-3">
        <NotificationBell
          basePath={role === 'admin' || role === 'hr' ? '/admin' : '/me'}
        />
        <div className="text-right leading-tight">
          <div className="max-w-[40vw] truncate text-sm font-medium md:max-w-none">{name}</div>
          <div className="text-xs capitalize text-muted-foreground">{role}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          className="shrink-0"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
