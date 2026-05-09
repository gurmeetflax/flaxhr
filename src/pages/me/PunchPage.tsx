import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, CheckSquare, MapPin, Plane, RotateCcw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useMyEmployee } from '@/lib/auth'
import {
  useMyOutlet,
  useMyTodayPunches,
  useNextPunchType,
  usePunch,
} from '@/lib/attendance'
import { GeoError, haversineMeters, watchPosition } from '@/lib/geo'
import { useAppSetting } from '@/lib/appSettings'
import { pickOutletForPunch, useMyOutlets } from '@/lib/employeeOutlets'

type Step = 'idle' | 'selfie' | 'review'

export default function PunchPage() {
  const { data: employee } = useMyEmployee()
  const { data: outlet, isLoading: outletLoading } = useMyOutlet()
  const { data: myOutlets = [] } = useMyOutlets()
  const { data: todayPunches = [] } = useMyTodayPunches()
  const nextType = useNextPunchType()
  const punch = usePunch()
  const { data: selfieRequired = true } = useAppSetting<boolean>('selfie_required', true)

  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [selfie, setSelfie] = useState<{ blob: Blob; preview: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stop = watchPosition(
      (p) => {
        setCoords({ lat: p.lat, lng: p.lng, accuracy: p.accuracy })
        setGeoError(null)
      },
      (err) => setGeoError(geoMessage(err)),
    )
    return stop
  }, [])

  useEffect(() => {
    return () => {
      if (selfie) URL.revokeObjectURL(selfie.preview)
    }
  }, [selfie])

  // When the user has multiple allowed outlets, pick the closest one
  // they're inside the geofence of. Falls back to closest overall so
  // the distance pill stays meaningful even when out of range.
  const pick = coords && myOutlets.length > 0
    ? pickOutletForPunch(myOutlets, coords.lat, coords.lng)
    : null
  const useOutlet = pick?.outlet ?? null

  const distance = useOutlet
    ? pick?.distance_m ?? null
    : coords && outlet?.lat != null && outlet?.lng != null
      ? haversineMeters(coords, { lat: outlet.lat, lng: outlet.lng })
      : null

  const radius = useOutlet?.geofence_radius_m ?? outlet?.geofence_radius_m ?? 200
  const inside = distance !== null && distance <= radius
  const tz = outlet?.timezone ?? 'Asia/Kolkata'
  const showOutletPicker = myOutlets.length > 1

  const submitWith = async (selfieBlob: Blob | undefined, lat: number, lng: number) => {
    try {
      const result = await punch.mutateAsync({
        selfie: selfieBlob,
        lat,
        lng,
        outletId: useOutlet?.outlet_id ?? null,
      })
      toast.success(
        `${result.type === 'in' ? 'Punched in' : 'Punched out'} at ${formatInTimeZone(
          result.punched_at,
          tz,
          'h:mm a',
        )}`,
      )
      resetCapture()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Punch failed')
    }
  }

  // One-shot capture → submit. No review screen, no extra tap. We still
  // store the preview briefly so the user can see what was sent.
  const onChooseSelfie = (file: File) => {
    if (selfie) URL.revokeObjectURL(selfie.preview)
    setSelfie({ blob: file, preview: URL.createObjectURL(file) })
    if (!coords) {
      toast.error('Waiting for your location. Try again in a moment.')
      setStep('review')
      return
    }
    if (!inside) {
      toast.error(`Outside geofence — you're ${distance} m away (allowed: ${radius} m).`)
      setStep('review')
      return
    }
    setStep('review')
    void submitWith(file, coords.lat, coords.lng)
  }

  const onSubmit = async () => {
    if (!selfie || !coords) {
      toast.error('Waiting for your location. Please allow location access.')
      return
    }
    if (!inside) {
      toast.error(`Outside geofence — you're ${distance} m away (allowed: ${radius} m).`)
      return
    }
    await submitWith(selfie.blob, coords.lat, coords.lng)
  }

  const resetCapture = () => {
    if (selfie) URL.revokeObjectURL(selfie.preview)
    setSelfie(null)
    setStep('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const hasGeo = !!coords && !geoError

  return (
    <>
      <PageHeader
        title={
          employee?.full_name ? `Hi, ${employee.full_name.split(' ')[0]}` : 'Punch in / out'
        }
        description={
          showOutletPicker && useOutlet
            ? `Punching at: ${useOutlet.outlet_name ?? useOutlet.outlet_id}` +
              (myOutlets.length > 1 ? ` · ${myOutlets.length} outlets allowed` : '')
            : outlet?.display_name
              ? `Outlet: ${outlet.display_name}`
              : undefined
        }
      />

      {!outletLoading && !outlet ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>No outlet assigned</CardTitle>
            <CardDescription className="mt-1">
              Ask an admin to assign you to an outlet before you can punch in.
            </CardDescription>
          </CardContent>
        </Card>
      ) : null}

      {outlet && (outlet.lat == null || outlet.lng == null) ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>Outlet geofence not set</CardTitle>
            <CardDescription className="mt-1">
              Your outlet doesn't have coordinates yet. Ask an admin to configure the geofence.
            </CardDescription>
          </CardContent>
        </Card>
      ) : null}

      {outlet && outlet.lat != null && outlet.lng != null ? (
        <div className="grid gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                    Next action
                  </CardTitle>
                  <p className="mt-1 text-2xl font-semibold">
                    {nextType === 'in' ? 'Punch in' : 'Punch out'}
                  </p>
                </div>
                <DistancePill
                  distance={distance}
                  radius={radius}
                  loading={!hasGeo && !geoError}
                />
              </div>

              {geoError ? (
                <p className="text-sm text-destructive">{geoError}</p>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {hasGeo
                    ? `Accuracy ±${Math.round(coords!.accuracy)} m`
                    : 'Locating you…'}
                </p>
              )}

              {step === 'idle' && selfieRequired ? (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!hasGeo || !inside}
                >
                  <Camera className="h-4 w-4" />
                  {hasGeo
                    ? inside
                      ? `Take selfie to ${nextType === 'in' ? 'punch in' : 'punch out'}`
                      : 'Move closer to the outlet'
                    : 'Waiting for location…'}
                </Button>
              ) : null}

              {step === 'idle' && !selfieRequired ? (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    if (!coords) {
                      toast.error('Waiting for your location.')
                      return
                    }
                    if (!inside) {
                      toast.error(
                        `Outside geofence — you're ${distance} m away (allowed: ${radius} m).`,
                      )
                      return
                    }
                    void submitWith(undefined, coords.lat, coords.lng)
                  }}
                  loading={punch.isPending}
                  disabled={!hasGeo || !inside}
                >
                  <Send className="h-4 w-4" />
                  {hasGeo
                    ? inside
                      ? nextType === 'in'
                        ? 'Punch in'
                        : 'Punch out'
                      : 'Move closer to the outlet'
                    : 'Waiting for location…'}
                </Button>
              ) : null}

              {step === 'review' && selfie ? (
                <div className="flex flex-col gap-3">
                  <img
                    src={selfie.preview}
                    alt="Selfie preview"
                    className="aspect-square w-full max-w-xs self-center rounded-xl border border-border object-cover"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={resetCapture} disabled={punch.isPending}>
                      <RotateCcw className="h-4 w-4" />
                      Retake
                    </Button>
                    <Button onClick={onSubmit} loading={punch.isPending} disabled={!inside}>
                      <Send className="h-4 w-4" />
                      Submit {nextType === 'in' ? 'punch in' : 'punch out'}
                    </Button>
                  </div>
                </div>
              ) : null}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onChooseSelfie(f)
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              <CardTitle>Today</CardTitle>
              {todayPunches.length === 0 ? (
                <CardDescription>No punches yet today.</CardDescription>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {todayPunches.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="font-medium capitalize">{p.type}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {formatInTimeZone(p.punched_at, tz, 'h:mm a')}
                        {p.distance_m != null ? ` · ${p.distance_m} m` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {format(new Date(), 'EEEE, d MMM yyyy')}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              to="/me/leave"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              <Plane className="h-4 w-4" /> Apply for leave
            </Link>
            <Link
              to="/me/regularise"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              <CheckSquare className="h-4 w-4" /> Regularise punch
            </Link>
          </div>
        </div>
      ) : null}
    </>
  )
}

function DistancePill({
  distance,
  radius,
  loading,
}: {
  distance: number | null
  radius: number
  loading: boolean
}) {
  if (loading) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        Locating…
      </span>
    )
  }
  if (distance === null) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        No location
      </span>
    )
  }
  const inside = distance <= radius
  return (
    <span
      className={
        'rounded-full px-3 py-1 text-xs font-medium ' +
        (inside
          ? 'bg-primary/10 text-primary'
          : 'bg-destructive/10 text-destructive')
      }
    >
      {distance} m / {radius} m
    </span>
  )
}

function geoMessage(err: GeoError): string {
  switch (err.code) {
    case 'denied':
      return 'Location permission denied. Enable it in your browser to punch in.'
    case 'unavailable':
      return 'Location unavailable. Move outdoors and try again.'
    case 'timeout':
      return 'Could not get your location in time. Try again.'
    case 'unsupported':
      return 'This device does not support location services.'
  }
}

