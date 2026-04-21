import { useQuery } from '@tanstack/react-query'
import { Users, Store, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'

export default function AdminDashboard() {
  const counts = useQuery({
    queryKey: ['admin-dashboard-counts'],
    queryFn: async () => {
      const [outlets, employees] = await Promise.all([
        supabase
          .from('flax_outlets')
          .select('id', { count: 'exact', head: true })
          .eq('active', true),
        supabase
          .schema('core' as never)
          .from('employees')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .is('deleted_at', null),
      ])
      return {
        outlets: outlets.count ?? 0,
        employees: employees.count ?? 0,
      }
    },
  })

  return (
    <>
      <PageHeader
        title="Admin overview"
        description="HR, attendance and payroll across the Flax outlet network."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Active outlets" value={counts.data?.outlets} icon={Store} />
        <Stat label="Active employees" value={counts.data?.employees} icon={Users} />
        <Stat label="Your roles" value="Admin" icon={ShieldCheck} />
      </div>

      <Card className="mt-8">
        <CardContent className="flex flex-col gap-2 p-6">
          <CardTitle>What's next</CardTitle>
          <CardDescription>
            Fill in lat/lng + geofence radius for every outlet (attendance needs this), then onboard
            your first employees. You can use the Employees → New button to create a test employee
            for the PIN login flow.
          </CardDescription>
        </CardContent>
      </Card>
    </>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string | undefined
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value ?? '—'}</div>
        </div>
      </CardContent>
    </Card>
  )
}
