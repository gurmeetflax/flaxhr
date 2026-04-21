import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MapPin, Pencil, CheckCircle2, AlertCircle, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface Outlet {
  id: string
  name: string
  display_name: string | null
  city: string | null
  timezone: string | null
  active: boolean | null
  address: string | null
  lat: number | null
  lng: number | null
  geofence_radius_m: number | null
}

export default function OutletsPage() {
  const outletsQ = useQuery<Outlet[]>({
    queryKey: ['outlets-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select(
          'id, name, display_name, city, timezone, active, address, lat, lng, geofence_radius_m',
        )
        .order('display_name', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })

  const outlets = outletsQ.data ?? []
  const configured = outlets.filter((o) => o.lat != null && o.lng != null).length

  return (
    <>
      <PageHeader
        title="Outlets"
        description="Set address, coordinates and geofence for each outlet. Attendance uses these to validate punches."
        actions={
          <Link to="/admin/outlets/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New outlet
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-lg bg-muted px-3 py-1 text-muted-foreground">
          {outlets.length} outlets
        </span>
        <span
          className={cn(
            'rounded-lg px-3 py-1',
            configured === outlets.length && outlets.length > 0
              ? 'bg-primary/15 text-primary'
              : 'bg-warning/15 text-warning',
          )}
        >
          {configured} / {outlets.length} have coordinates
        </span>
      </div>

      <div className="grid gap-3">
        {outletsQ.isLoading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        ) : (
          outlets.map((o) => <OutletRow key={o.id} outlet={o} />)
        )}
      </div>
    </>
  )
}

function OutletRow({ outlet }: { outlet: Outlet }) {
  const hasCoords = outlet.lat != null && outlet.lng != null
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              'mt-1 grid h-9 w-9 place-items-center rounded-lg',
              hasCoords ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                {outlet.display_name ?? outlet.name}
              </h3>
              {outlet.active ? (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Active
                </span>
              ) : (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {outlet.city ?? '—'} · <code className="font-mono">{outlet.id}</code>
            </p>
            <p className="mt-1 text-sm text-foreground/80">
              {outlet.address ?? (
                <span className="italic text-muted-foreground">No address yet</span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              {hasCoords ? (
                <span className="flex items-center gap-1 text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {outlet.lat!.toFixed(5)}, {outlet.lng!.toFixed(5)}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-warning">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No coordinates — attendance will allow punches but flag them.
                </span>
              )}
              <span className="text-muted-foreground">
                Geofence: {outlet.geofence_radius_m ?? 200} m
              </span>
            </div>
          </div>
        </div>
        <Link to={`/admin/outlets/${outlet.id}`} className="sm:shrink-0">
          <Button variant="secondary" size="sm">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
