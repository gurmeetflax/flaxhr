import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { IS_NATIVE } from '@/lib/native'

export interface RosterImageCell {
  label: string // shift name, "Off" or ""
  time: string // "9:30 AM" or ""
  off?: boolean
}

export interface RosterImageRow {
  name: string
  cells: RosterImageCell[]
}

const W_NAME = 220
const W_DAY = 160
const H_HEAD = 96
const H_COLS = 44
const H_ROW = 54
const PAD = 24

// Draws an outlet's week as a PNG that reads well inside WhatsApp.
export async function renderRosterPng(opts: {
  outletName: string
  days: string[]
  rows: RosterImageRow[]
}): Promise<Blob> {
  const { outletName, days, rows } = opts
  const scale = 2
  const width = PAD * 2 + W_NAME + W_DAY * days.length
  const height = PAD * 2 + H_HEAD + H_COLS + H_ROW * Math.max(rows.length, 1) + 28
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Header
  ctx.fillStyle = '#65a30d'
  ctx.fillRect(0, 0, width, 6)
  ctx.fillStyle = '#0f172a'
  ctx.font = font(700, 26)
  ctx.fillText(`${outletName} — Roster`, PAD, PAD + 34)
  ctx.fillStyle = '#475569'
  ctx.font = font(500, 16)
  ctx.fillText(
    `${format(parseISO(days[0]), 'EEE d MMM')} – ${format(parseISO(days[days.length - 1]), 'EEE d MMM yyyy')}`,
    PAD,
    PAD + 62,
  )

  // Column headers
  const top = PAD + H_HEAD
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(PAD, top, width - PAD * 2, H_COLS)
  ctx.fillStyle = '#334155'
  ctx.font = font(700, 14)
  ctx.fillText('Staff', PAD + 12, top + 27)
  days.forEach((d, i) => {
    const x = PAD + W_NAME + i * W_DAY
    ctx.fillText(format(parseISO(d), 'EEE d'), x + 12, top + 27)
  })

  // Rows
  rows.forEach((r, ri) => {
    const y = top + H_COLS + ri * H_ROW
    if (ri % 2 === 1) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(PAD, y, width - PAD * 2, H_ROW)
    }
    ctx.fillStyle = '#0f172a'
    ctx.font = font(600, 15)
    ctx.fillText(fit(ctx, r.name, W_NAME - 20), PAD + 12, y + 33)
    r.cells.forEach((c, ci) => {
      const x = PAD + W_DAY * ci + W_NAME
      if (c.off) {
        ctx.fillStyle = '#e2e8f0'
        roundRect(ctx, x + 8, y + 10, W_DAY - 16, H_ROW - 20, 8)
        ctx.fillStyle = '#475569'
        ctx.font = font(700, 14)
        ctx.fillText('OFF', x + 18, y + 32)
      } else if (c.label) {
        ctx.fillStyle = '#ecfccb'
        roundRect(ctx, x + 8, y + 7, W_DAY - 16, H_ROW - 14, 8)
        ctx.fillStyle = '#365314'
        ctx.font = font(700, 13)
        ctx.fillText(fit(ctx, c.label, W_DAY - 28), x + 16, y + 25)
        ctx.font = font(500, 12)
        ctx.fillText(fit(ctx, c.time, W_DAY - 28), x + 16, y + 41)
      } else {
        ctx.fillStyle = '#94a3b8'
        ctx.font = font(500, 14)
        ctx.fillText('—', x + 18, y + 32)
      }
    })
    ctx.strokeStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.moveTo(PAD, y + H_ROW)
    ctx.lineTo(width - PAD, y + H_ROW)
    ctx.stroke()
  })
  if (!rows.length) {
    ctx.fillStyle = '#64748b'
    ctx.font = font(500, 15)
    ctx.fillText('No staff at this outlet.', PAD + 12, top + H_COLS + 32)
  }

  ctx.fillStyle = '#94a3b8'
  ctx.font = font(500, 12)
  ctx.fillText(`Flax HR · ${format(new Date(), 'd MMM yyyy, h:mm a')}`, PAD, height - PAD + 4)

  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image failed'))), 'image/png'))
}

// Share to WhatsApp. Phones with Web Share (Chrome, home-screen app) get the
// share sheet with the PNG itself; inside the Android app we upload it and
// send a link; on desktop we download it and open WhatsApp Web.
export async function shareRosterPng(blob: Blob, outletName: string, weekStart: string): Promise<'shared' | 'link' | 'downloaded'> {
  const fileName = `roster-${outletName.replace(/[^\w]+/g, '-').toLowerCase()}-${weekStart}.png`
  const file = new File([blob], fileName, { type: 'image/png' })
  const text = `${outletName} roster — week of ${format(parseISO(weekStart), 'd MMM')}`

  if (!IS_NATIVE && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: text, text })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared'
    }
  }

  if (IS_NATIVE) {
    const path = `${weekStart}/${crypto.randomUUID()}-${fileName}`
    const { error } = await supabase.storage.from('roster-shares').upload(path, blob, { contentType: 'image/png' })
    if (error) throw error
    const { data, error: urlErr } = await supabase.storage.from('roster-shares').createSignedUrl(path, 60 * 60 * 24 * 14)
    if (urlErr) throw urlErr
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${data.signedUrl}`)}`, '_blank')
    return 'link'
  }

  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
  window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
  return 'downloaded'
}

function fit(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s
  let t = s
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}
