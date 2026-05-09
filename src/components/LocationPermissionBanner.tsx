import { useCallback, useEffect, useState } from 'react'
import { MapPin, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getCurrentPosition, GeoError, type GeoPermissionState } from '@/lib/geo'

/**
 * Banner shown above any page that needs the device location.
 *
 * Browsers typically prompt silently — the user sees a tiny system
 * popup with no context. This banner explains *why* we need location
 * and offers a clear button to trigger the prompt. When the user has
 * denied permission, it surfaces instructions to re-enable.
 */
export default function LocationPermissionBanner({
  reason = "We need your location to verify you're at the outlet before punching.",
  className,
}: {
  reason?: string
  className?: string
}) {
  const { state, refresh } = useGeoPermission()
  const [requesting, setRequesting] = useState(false)
  const [denied, setDenied] = useState(false)

  // Don't render anything when permission is granted/unsupported.
  if (state === 'granted' || state === 'unsupported' || state === 'unknown') {
    return null
  }

  const isDenied = state === 'denied' || denied

  async function onAllow() {
    setRequesting(true)
    try {
      await getCurrentPosition()
      refresh()
    } catch (e) {
      if (e instanceof GeoError && e.code === 'denied') setDenied(true)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div
      className={
        'mb-4 flex flex-wrap items-start gap-3 rounded-lg border p-4 ' +
        (isDenied
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-warning/40 bg-warning/5') +
        (className ? ` ${className}` : '')
      }
    >
      <span
        className={
          'mt-0.5 grid h-9 w-9 place-items-center rounded-lg ' +
          (isDenied ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')
        }
      >
        {isDenied ? <ShieldAlert className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {isDenied ? 'Location is blocked' : 'Allow location access'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isDenied
            ? "Your browser is blocking this page from reading location. Tap the lock icon in the address bar (or Settings → Site settings on iOS) and allow Location, then refresh this page."
            : reason}
        </p>
      </div>
      {!isDenied ? (
        <Button size="sm" onClick={onAllow} loading={requesting}>
          Allow location
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      )}
    </div>
  )
}

/**
 * Hook returning the current geolocation permission state. Refreshes
 * via Permissions API change events when the browser supports it; on
 * iOS Safari it falls back to 'prompt' / 'granted' transitions.
 */
export function useGeoPermission() {
  const [state, setState] = useState<GeoPermissionState>('unknown')
  const refresh = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unsupported')
      return
    }
    if (!navigator.permissions || !navigator.permissions.query) {
      setState('prompt')
      return
    }
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((res) => {
        setState(res.state as GeoPermissionState)
        res.onchange = () => setState(res.state as GeoPermissionState)
      })
      .catch(() => setState('prompt'))
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { state, refresh }
}
