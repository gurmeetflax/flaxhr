import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const IST = 'Asia/Kolkata'

export function toIST(d: Date | string | number) {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  return toZonedTime(date, IST)
}

export function formatIST(d: Date | string | number, pattern = 'dd MMM yyyy, HH:mm') {
  return format(toIST(d), pattern)
}

export function formatISTDate(d: Date | string | number) {
  return formatIST(d, 'dd MMM yyyy')
}

export function formatISTTime(d: Date | string | number) {
  return formatIST(d, 'HH:mm')
}
