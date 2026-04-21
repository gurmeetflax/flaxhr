import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, useMyRoles, type Role } from '@/lib/auth'

export default function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode
  roles?: Role[]
}) {
  const { user, loading } = useAuth()
  const { data: myRoles, isLoading: rolesLoading } = useMyRoles()
  const location = useLocation()

  if (loading || (user && rolesLoading)) {
    return <FullScreenLoader />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && roles.length > 0) {
    const ok = (myRoles ?? []).some((r) => roles.includes(r.role))
    if (!ok) return <Navigate to="/forbidden" replace />
  }

  return <>{children}</>
}

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
      <div className="flex items-center gap-3 text-sm">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path
            d="M22 12a10 10 0 0 1-10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        Loading…
      </div>
    </div>
  )
}
