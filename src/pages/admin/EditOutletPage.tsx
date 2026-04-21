import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crosshair, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { isValidEmail, joinEmails, parseEmails } from '@/lib/identity'

interface Outlet {
  id: string
  name: string
  display_name: string | null
  city: string | null
  active: boolean | null
  address: string | null
  lat: number | null
  lng: number | null
  geofence_radius_m: number | null
  emails: string[] | null
}

export default function EditOutletPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const outletQ = useQuery<Outlet | null>({
    queryKey: ['outlet', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('flax_outlets')
        .select(
          'id, name, display_name, city, active, address, lat, lng, geofence_radius_m, emails',
        )
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as Outlet) ?? null
    },
    enabled: !!id,
  })

  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radius, setRadius] = useState('200')
  const [emails, setEmails] = useState('')
  const [active, setActive] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!outletQ.data) return
    const o = outletQ.data
    setAddress(o.address ?? '')
    setLat(o.lat != null ? String(o.lat) : '')
    setLng(o.lng != null ? String(o.lng) : '')
    setRadius(String(o.geofence_radius_m ?? 200))
    setEmails(joinEmails(o.emails))
    setActive(!!o.active)
  }, [outletQ.data])

  const save = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No outlet id')
      const patch = {
        address: address.trim() || null,
        lat: lat.trim() ? Number(lat) : null,
        lng: lng.trim() ? Number(lng) : null,
        geofence_radius_m: radius.trim() ? Number(radius) : 200,
        emails: parseEmails(emails),
        active,
      }
      const { error } = await supabase.from('flax_outlets').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outlets-all'] })
      qc.invalidateQueries({ queryKey: ['outlet', id] })
      qc.invalidateQueries({ queryKey: ['outlets'] })
      toast.success('Outlet updated')
      navigate('/admin/outlets')
    },
    onError: (e: Error) => {
      setErr(e.message)
      toast.error(e.message)
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (lat && (Number(lat) < -90 || Number(lat) > 90)) return setErr('Latitude must be between -90 and 90.')
    if (lng && (Number(lng) < -180 || Number(lng) > 180)) return setErr('Longitude must be between -180 and 180.')
    const r = Number(radius)
    if (!Number.isFinite(r) || r < 25 || r > 5000)
      return setErr('Geofence radius must be between 25 and 5000 metres.')
    if ((lat && !lng) || (!lat && lng)) return setErr('Set both latitude and longitude, or leave both empty.')
    const parsedEmails = parseEmails(emails)
    const bad = parsedEmails.find((e) => !isValidEmail(e))
    if (bad) return setErr(`"${bad}" is not a valid email address.`)
    save.mutate()
  }

  function captureLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('This browser does not expose geolocation.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
        toast.success(`Captured (±${Math.round(pos.coords.accuracy)} m accuracy)`)
      },
      (e) => {
        setLocating(false)
        toast.error(`Could not capture location: ${e.message}`)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  if (outletQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading outlet…</CardContent>
      </Card>
    )
  }

  if (!outletQ.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Outlet not found.</CardContent>
      </Card>
    )
  }

  const o = outletQ.data
  const mapsHref =
    lat && lng
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`
      : `https://www.google.com/maps/search/${encodeURIComponent(
          `Flax ${o.display_name ?? o.name} ${o.city ?? ''}`,
        )}`

  return (
    <>
      <PageHeader
        title={o.display_name ?? o.name}
        description={`${o.city ?? '—'} · ${o.id}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/outlets')}>
            Back
          </Button>
        }
      />
      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="Street, area, landmark, pincode"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                inputMode="decimal"
                placeholder="19.0760"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                inputMode="decimal"
                placeholder="72.8777"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2 -mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={captureLocation} loading={locating}>
                <Crosshair className="h-4 w-4" /> Use my current location
              </Button>
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
              </a>
              <span className="text-xs text-muted-foreground">
                Tip: stand at the outlet, tap "Use my current location" on your phone.
              </span>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="emails">Contact emails</Label>
              <Input
                id="emails"
                placeholder="manager@flaxitup.com, store.bandra@flaxitup.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. Shared with complaint / ops tools across Flax.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="radius">Geofence radius (metres)</Label>
              <Input
                id="radius"
                inputMode="numeric"
                value={radius}
                onChange={(e) => setRadius(e.target.value.replace(/\D/g, ''))}
              />
              <p className="text-xs text-muted-foreground">25 – 5000 m. Default 200.</p>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus-visible:ring-ring"
                />
                Outlet is active
              </label>
            </div>

            {err ? <p className="sm:col-span-2 text-sm text-destructive">{err}</p> : null}

            <div className="sm:col-span-2 flex items-center gap-2 pt-2">
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/admin/outlets')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
