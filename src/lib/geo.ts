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

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 5_000,
}

export function getCurrentPosition(options?: PositionOptions): Promise<GeoPosition> {
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
): () => void {
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
