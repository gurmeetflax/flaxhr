import { Geolocation } from '@capacitor/geolocation'
import { IS_NATIVE } from '@/lib/native'

export interface GeoPosition {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

export type GeoErrorCode = 'unsupported' | 'denied' | 'unavailable' | 'timeout'

export class GeoError extends Error {
  readonly code: GeoErrorCode
  constructor(code: GeoErrorCode, message: string) {
    super(message)
    this.name = 'GeoError'
    this.code = code
  }
}

export type LocationPrecision = 'precise' | 'approximate'

// Android 12+ lets the user grant only "approximate" location, which
// pins every fix at ~±2000 m. Asking for 'location' again while only
// coarse is granted shows the system "Change to precise location?"
// dialog, so we always ask rather than accepting coarse.
export async function ensureNativeLocationPermission(): Promise<LocationPrecision> {
  let perm = await Geolocation.checkPermissions()
  if (perm.location !== 'granted') {
    perm = await Geolocation.requestPermissions({ permissions: ['location'] })
  }
  if (perm.location === 'granted') return 'precise'
  if (perm.coarseLocation === 'granted') return 'approximate'
  throw new GeoError('denied', 'Location permission was denied.')
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 5_000,
}

export async function getCurrentPosition(options?: PositionOptions): Promise<GeoPosition> {
  if (IS_NATIVE) {
    // Native path — uses the OS location provider (much more accurate on
    // Android, works even when the WebView doesn't have HTTPS geolocation).
    try {
      await ensureNativeLocationPermission()
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? DEFAULT_OPTIONS.timeout,
        maximumAge: options?.maximumAge ?? DEFAULT_OPTIONS.maximumAge,
      })
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
        timestamp: pos.timestamp,
      }
    } catch (e) {
      if (e instanceof GeoError) throw e
      const msg = e instanceof Error ? e.message : String(e)
      throw new GeoError('unavailable', msg)
    }
  }
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeoError('unsupported', 'Geolocation is not supported on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => {
        const code =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.POSITION_UNAVAILABLE
            ? 'unavailable'
            : 'timeout'
        reject(new GeoError(code, err.message || code))
      },
      { ...DEFAULT_OPTIONS, ...options },
    )
  })
}

export function watchPosition(
  onUpdate: (pos: GeoPosition) => void,
  onError?: (err: GeoError) => void,
  options?: PositionOptions,
  onPrecision?: (p: LocationPrecision) => void,
): () => void {
  if (IS_NATIVE) return watchNative(onUpdate, onError, options, onPrecision)
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError?.(new GeoError('unsupported', 'Geolocation is not supported on this device.'))
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }),
    (err) => {
      const code =
        err.code === err.PERMISSION_DENIED
          ? 'denied'
          : err.code === err.POSITION_UNAVAILABLE
          ? 'unavailable'
          : 'timeout'
      onError?.(new GeoError(code, err.message || code))
    },
    { ...DEFAULT_OPTIONS, ...options },
  )
  return () => navigator.geolocation.clearWatch(id)
}

// Inside the app: the OS location provider (GPS) instead of the
// WebView's browser geolocation, which is often wifi-only.
function watchNative(
  onUpdate: (pos: GeoPosition) => void,
  onError?: (err: GeoError) => void,
  options?: PositionOptions,
  onPrecision?: (p: LocationPrecision) => void,
): () => void {
  let stopped = false
  let watchId: string | null = null
  ;(async () => {
    try {
      const precision = await ensureNativeLocationPermission()
      onPrecision?.(precision)
      if (stopped) return
      const id = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: options?.timeout ?? DEFAULT_OPTIONS.timeout,
          maximumAge: options?.maximumAge ?? DEFAULT_OPTIONS.maximumAge,
        },
        (pos, err) => {
          if (err || !pos) {
            const msg = err instanceof Error ? err.message : String(err ?? 'unavailable')
            onError?.(new GeoError(/denied|permission/i.test(msg) ? 'denied' : 'unavailable', msg))
            return
          }
          onUpdate({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 0,
            timestamp: pos.timestamp,
          })
        },
      )
      if (stopped) void Geolocation.clearWatch({ id })
      else watchId = id
    } catch (e) {
      onError?.(e instanceof GeoError ? e : new GeoError('unavailable', String(e)))
    }
  })()
  return () => {
    stopped = true
    if (watchId) void Geolocation.clearWatch({ id: watchId })
  }
}

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)))
}

export type GeoPermissionState = 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported'
