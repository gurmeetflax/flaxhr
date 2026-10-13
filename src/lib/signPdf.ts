import { formatInTimeZone } from 'date-fns-tz'
import { LETTER_CSS } from '@/lib/documents'

// Letter HTML → A4 PDF in the browser. html2canvas and jsPDF are loaded
// only when a document is actually being signed.

const A4_W_PX = 794 // A4 width at 96 dpi
const A4_H_PX = 1123

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Put the employee's signature and date into the letter's signature slots.
export function fillEmployeeSignature(html: string, signatureDataUrl: string, signedOn: string): string {
  return html
    .replace(
      /<div class="pending" data-slot="employee-signature">[^<]*<\/div>/,
      `<img src="${signatureDataUrl}" alt="Employee signature"/>`,
    )
    .replace(/<span data-slot="employee-signed-on">[^<]*<\/span>/, `<span>${signedOn}</span>`)
}

export function certificateHtml(c: {
  title: string
  employeeName: string
  employeeCode: string
  requestId: string
  signedAt: Date
  sha256: string
  signatureDataUrl: string
  aadhaarFallback: boolean
}): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const row = (k: string, v: string) =>
    `<tr><td style="color:#64748b;padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 0">${v}</td></tr>`
  return `<div class="letter" style="font-family:system-ui,sans-serif">
<h1>Signature certificate</h1>
<p style="color:#475569">This page records how the document above was signed electronically in the Flax HR app.</p>
<table style="font-size:13px;border-collapse:collapse">
${row('Document', esc(c.title))}
${row('Signed by', `${esc(c.employeeName)} (${esc(c.employeeCode)})`)}
${row('Signed at', formatInTimeZone(c.signedAt, 'Asia/Kolkata', "d MMMM yyyy, h:mm:ss a 'IST'"))}
${row('Method', `Electronic signature in the Flax HR app, after re-entering the account PIN${c.aadhaarFallback ? ' (used because Aadhaar eSign could not be completed)' : ''}`)}
${row('Device', esc(navigator.userAgent))}
${row('Document ID', c.requestId)}
${row('Content SHA-256', `<span style="font-family:monospace;font-size:11px;word-break:break-all">${c.sha256}</span>`)}
</table>
<p style="margin-top:16px">Signature:</p>
<img src="${c.signatureDataUrl}" alt="signature" style="height:70px;border-bottom:1px solid #9ca3af"/>
<p style="margin-top:24px;font-size:11px;color:#64748b">The signer's IP address and session are recorded on the server with this signature. The content fingerprint above lets anyone check the letter text was not changed after signing.</p>
</div>`
}

async function waitForImages(el: HTMLElement) {
  const imgs = [...el.querySelectorAll('img')]
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = () => res()
            img.onerror = () => res()
          }),
    ),
  )
}

// A row of near-white pixels to break the page on, so lines aren't cut.
function findBreak(ctx: CanvasRenderingContext2D, width: number, target: number, scale: number): number {
  const lookback = Math.round(140 * scale)
  for (let y = target; y > target - lookback && y > 0; y--) {
    const row = ctx.getImageData(0, y, width, 1).data
    let blank = true
    for (let i = 0; i < row.length; i += 16) {
      if (row[i] < 245 || row[i + 1] < 245 || row[i + 2] < 245) {
        blank = false
        break
      }
    }
    if (blank) return y
  }
  return target
}

export async function htmlToPdf(pages: string[]): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const pdf = new jsPDF({ unit: 'px', format: [A4_W_PX, A4_H_PX], hotfixes: ['px_scaling'] })
  const scale = 2
  const margin = 40
  let first = true

  for (const html of pages) {
    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_PX}px;background:#fff`
    host.innerHTML = `<style>${LETTER_CSS} .letter{max-width:none;padding:${margin}px 48px}</style>${html}`
    document.body.appendChild(host)
    try {
      await waitForImages(host)
      const canvas = await html2canvas(host, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: A4_W_PX,
      })
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const pageH = A4_H_PX * scale
      let y = 0
      while (y < canvas.height - 2) {
        const end =
          y + pageH >= canvas.height
            ? canvas.height
            : findBreak(ctx, canvas.width, y + pageH - margin * scale, scale)
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = end - y
        slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y)
        if (!first) pdf.addPage([A4_W_PX, A4_H_PX])
        first = false
        pdf.addImage(
          slice.toDataURL('image/jpeg', 0.9),
          'JPEG',
          0,
          y === 0 ? 0 : margin / 2,
          A4_W_PX,
          (end - y) / scale,
        )
        y = end
      }
    } finally {
      host.remove()
    }
  }
  return pdf.output('blob')
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}
