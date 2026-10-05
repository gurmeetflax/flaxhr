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
import {
  ensureNativeLocationPermission,
  GeoError,
  haversineMeters,
  watchPosition,
  type LocationPrecision,
} from '@/lib/geo'
import { useAppSetting } from '@/lib/appSettings'
import { pickOutletForPunch, useMyOutlets } from '@/lib/employeeOutlets'
import LocationPermissionBanner from '@/components/LocationPermissionBanner'
import { IS_NATIVE } from '@/lib/native'
import { captureNativeSelfie } from '@/lib/nativeCamera'

type Step = 'idle' | 'selfie' | 'review'

export default function PunchPage() {
  const { data: employee } = useMyEmployee()
  const { data: outlet, isLoading: outletLoading } = useMyOutlet()
  const { data: myOutlets = [] } = useMyOutlets()
  const { data: todayPunches = [] } = useMyTodayPunches()
  const nextType = useNextPunchType()
  const punch = usePunch()
  const { data: globalSelfieRequired = true } = useAppSetting<boolean>('selfie_required', true)
  // Per-employee override (null => inherit global).
  const empOverride = (employee as { selfie_required?: boolean | null } | undefined)?.selfie_required
  const selfieRequired = empOverride == null ? globalSelfieRequired : empOverride

  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [precision, setPrecision] = useState<LocationPrecision | null>(null)
  // Bumped to restart the location watch after a permission upgrade.
  const [watchKey, setWatchKey] = useState(0)
  const [step, setStep] = useState<Step>('idle')
  const [selfie, setSelfie] = useState<{ blob: Blob; preview: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Bumped after every successful punch so the <input type="file"> is
  // re-mounted; iOS Safari otherwise refuses to re-open the camera with
  // the same input element even after .value = ''.
  const [captureKey, setCaptureKey] = useState(0)

  useEffect(() => {
    const stop = watchPosition(
      (p) => {
        setCoords({ lat: p.lat, lng: p.lng, accuracy: p.accuracy })
        setGeoError(null)
      },
      (err) => setGeoError(geoMessage(err)),
      undefined,
      setPrecision,
    )
    return stop
  }, [watchKey])

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
  // GPS error so big the distance measurement is meaningless — covers the
  // "approximate location" permission (Android 12+ default), battery-saver
  // throttling, and indoor wifi-only fixes. Anything above radius × 2
  // (clamped to a floor of 150 m) is treated as too imprecise to trust.
  // Approximate-only permission pins fixes at ~±2 km. The app knows it
  // from the permission; in a browser a ~2 km reading is the giveaway.
  const approximateOnly =
    precision === 'approximate' || (!IS_NATIVE && coords !== null && coords.accuracy >= 1500)
  const accuracyPoor =
    coords !== null && coords.accuracy > Math.max(radius * 2, 150)
  const tz = outlet?.timezone ?? 'Asia/Kolkata'
  const showOutletPicker = myOutlets.length > 1

  const submitWith = async (selfieBlob: Blob | undefined, lat: number, lng: number) => {
    try {
      const result = await punch.mutateAsync({
        selfie: selfieBlob,
        lat,
        lng,
        accuracy: coords?.accuracy ?? null,
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
    setCaptureKey((k) => k + 1)
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
      {/* iOS Safari can report the permission as 'denied' while
          watchPosition is delivering fixes — trust the live fix. */}
      {hasGeo ? null : <LocationPermissionBanner />}

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
                <p className={`flex items-center gap-2 text-sm ${accuracyPoor ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  <MapPin className="h-4 w-4" />
                  {hasGeo
                    ? `Accuracy ±${Math.round(coords!.accuracy)} m${accuracyPoor ? ' · low GPS accuracy' : ''}`
                    : 'Locating you…'}
                </p>
              )}

              {accuracyPoor ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {approximateOnly ? (
                    <>
                      <div className="font-medium">Your phone is only sharing approximate location.</div>
                      {IS_NATIVE ? (
                        <>
                          <div className="mt-1 text-amber-800">
                            Precise location is off for Flax HR, so the reading can't get better than
                            ±2 km. Tap the button and choose <b>Precise</b>. If no prompt appears, open
                            phone <b>Settings → Apps → Flax HR → Permissions → Location</b> and turn on{' '}
                            <b>Use precise location</b>.
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 border-amber-300 bg-white"
                            onClick={async () => {
                              try {
                                const p = await ensureNativeLocationPermission()
                                setPrecision(p)
                                if (p === 'precise') {
                                  setWatchKey((k) => k + 1)
                                  toast.success('Precise location on — getting a better fix…')
                                }
                              } catch {
                                toast.error('Location permission is off. Turn it on in phone Settings.')
                              }
                            }}
                          >
                            Turn on precise location
                          </Button>
                        </>
                      ) : (
                        <div className="mt-1 text-amber-800">
                          Chrome only has approximate location, so the reading can't get better than
                          ±2 km. Fix: phone <b>Settings → Apps → Chrome → Permissions → Location</b> → turn
                          on <b>Use precise location</b>. Then in Chrome tap <b>⋮ → Settings → Site
                          settings → Location</b> and allow hr.flaxfoods.in. Reload this page.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="font-medium">Can't verify your location.</div>
                      <div className="mt-1 text-amber-800">
                        Your phone is reporting a ±{Math.round(coords!.accuracy)} m fix — far wider than
                        the {radius} m geofence. Try: step outside / near a window, turn on
                        high-accuracy / precise location, and switch off battery saver. Wait 10–20 s
                        for the fix to tighten.
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {step === 'idle' && selfieRequired ? (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={async () => {
                    if (IS_NATIVE) {
                      // Native Android: skip the file-picker chrome and hit
                      // the camera directly. Faster, no gallery option.
                      try {
                        const blob = await captureNativeSelfie()
                        const file = new File([blob], `selfie-${Date.now()}.jpg`, {
                          type: blob.type || 'image/jpeg',
                        })
                        onChooseSelfie(file)
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Camera failed')
                      }
                      return
                    }
                    fileInputRef.current?.click()
                  }}
                  disabled={!hasGeo || !inside || punch.isPending}
                  loading={punch.isPending}
                >
                  <Camera className="h-4 w-4" />
                  {hasGeo
                    ? inside
                      ? `Take selfie to ${nextType === 'in' ? 'punch in' : 'punch out'}`
                      : accuracyPoor
                        ? 'Low GPS accuracy — waiting for a better fix'
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
                      : accuracyPoor
                        ? 'Low GPS accuracy — waiting for a better fix'
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
                key={captureKey}
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

