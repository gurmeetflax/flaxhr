import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { supabase } from '@/lib/supabase'

// Monthly attendance report in the SalaryBox layout (one page / sheet per
// employee, the month's days across). The day statuses come from
// public.attendance_month_report, which uses the same core.attendance_days
// as the payroll run, so this report and the payslip always agree.

const IST = 'Asia/Kolkata'

export const COMPANY = {
  name: 'HEALTH AND BEYOND FOODS PRIVATE LIMITED',
  address:
    'Unit no. 12, Lakshmi Industry Estate, Hanuman Ln, near BMC Parking, Lower Parel West, Lower Parel, Mumbai, Maharashtra 400013',
  gstin: '27AAFCH4572C2ZO',
  logo: '/hb-logo.jpg',
}

export type DayStatus = 'P' | 'HD' | 'A' | 'WO' | 'PL' | 'UPL' | 'NE' | 'FUT'

export type Flag = 'half' | 'short' | 'late' | 'late_cut' | 'absent' | 'long'

export interface ReportDay {
  date: string
  status: DayStatus
  reason: string | null
  pairs: [string | null, string | null][]
  workedMin: number | null
  lateMin: number | null
  schedStart: string | null
  earlyMin: number | null
  otMin: number
  shortMin: number
  isLate: boolean
  longShift: boolean
  flags: Flag[]
}

export interface ReportEmployee {
  id: string
  code: string
  name: string
  phone: string | null
  outlet: string | null
  designation: string | null
  fieldStaff: boolean
  days: ReportDay[]
  summary: {
    payable: number
    present: number
    halfDays: number
    absent: number
    weekOff: number
    paidLeave: number
    unpaidLeave: number
    lates: number
    lateCut: number
    workedMin: number
    lateMin: number
    earlyMin: number
    otMin: number
    shortMin: number
    longShifts: number
  }
}

export interface MonthReport {
  from: string
  to: string
  monthLabel: string
  employees: ReportEmployee[]
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  P: 'Present',
  HD: 'Half day',
  A: 'Absent',
  WO: 'Week off',
  PL: 'Paid leave',
  UPL: 'Unpaid leave',
  NE: 'Not employed',
  FUT: 'Upcoming',
}

// Cell tints per status and marker colours per rule broken (hex, no #).
export const STATUS_FILL: Partial<Record<DayStatus, string>> = {
  HD: 'FFEDD5',
  A: 'FEE2E2',
  WO: 'F1F5F9',
  PL: 'DBEAFE',
  UPL: 'E5E7EB',
}

export const FLAGS: { flag: Flag; color: string; label: string }[] = [
  { flag: 'absent', color: 'DC2626', label: 'Absent (no punch, no approved leave)' },
  { flag: 'half', color: 'EA580C', label: 'Half day: missing punch, single tap or under 4h 30m' },
  {
    flag: 'short',
    color: '0EA5E9',
    label: 'Short hours: worked under 9h (full day) or under 4h 30m (half day)',
  },
  { flag: 'late', color: 'CA8A04', label: 'Late by more than 15 min after the rostered start' },
  { flag: 'late_cut', color: '7C2D12', label: '3rd, 6th, 9th… late of the month: half a day cut' },
  { flag: 'long', color: '7C3AED', label: 'Shift over 14 hours: check before paying overtime' },
]

export const RULES: string[] = [
  'Shift is 9 hours including break. Punches are paired into shifts; a shift counts on the day it starts, so a night shift (e.g. 6:45pm to 4am) is one day.',
  'Present (P): punch-in and punch-out with at least 4h 30m worked. Field staff: punch-in and punch-out is enough.',
  'Half day (HD): worked under 4h 30m, or a missing punch-in / punch-out, or a single tap at the end of the day. An approved regularisation adds the missing punch.',
  'Week off (WO): 4 paid week offs a month for anyone who worked 20 or more days; otherwise one week off for every 6 days worked. Rostered off days are used first, then the earliest days with no punch. Any further days off are absent.',
  'Absent (A): any other day with no punch and no approved leave.',
  'Late: arriving more than 15 minutes after the rostered shift start (over 3 hours late counts as working a different shift, not late). Every 3 lates in the month cost half a day.',
  'Short hours: a full day under the 9-hour working day, or a half day with both punches under 4h 30m, is cut by the minute at salary ÷ days in month ÷ 9 per hour. A half day from a missing punch has no hours to measure, so only the half day is cut.',
  'Overtime: time worked beyond 9h 30m in a day (9-hour shift + 30 minutes), paid at salary ÷ days in month ÷ 9 per hour. Shifts over 14 hours are flagged to check.',
  'Payable days = Present + ½ × Half days + Paid leave + Week offs - late cut. Pay = payable days × salary ÷ days in month + overtime - short hours.',
]

// Worked examples for the rules, on a ₹18,000 salary in a 31-day month
// (one day = ₹580.65, one hour = ₹64.52).
export const RULE_EXAMPLES: string[] = [
  'Shift 10:00–19:00, arrives 10:40, leaves 19:00: worked 8h 20m, so 40 min short = ₹43 cut, and it counts as 1 late.',
  'Leaves at 16:30 after a 10:00 start: worked 6h 30m, so 2h 30m short = ₹161 cut.',
  'Works 3 hours: half day (₹290) and 1h 30m short of 4h 30m (₹97 cut), so ₹194 is paid for the day.',
  'Forgets to punch out and does not regularise: half day, ₹290 cut. Regularise the punch-out and the day is counted in full.',
  'Works 10:00–21:00 (11 hours): 1h 30m over 9h 30m = ₹97 overtime.',
  '3 lates in the month: half a day cut (₹290). 6 lates: one day cut.',
  'Works 22 days and has 9 days with no punch: 4 week offs are paid, the other 5 days are absent.',
]

// The month's calculation for one employee, spelled out for the report.
export function calculationLines(e: ReportEmployee, daysInMonth: number): string[] {
  const s = e.summary
  const worked = s.present + s.halfDays
  const offs =
    worked >= 20
      ? '4 (worked 20 or more days)'
      : `${Math.min(4, Math.floor(worked / 6))} (1 per 6 days worked)`
  const lines = [
    `Week offs: ${worked} days worked, so ${offs} week offs.`,
    `Payable days = Present ${s.present} + Half days ${s.halfDays} × ½ (${s.halfDays / 2}) + Paid leave ${s.paidLeave} + Week offs ${s.weekOff} - Late cut ${s.lateCut} (${s.lates} lates; every 3 cost ½ day) = ${s.payable} of ${daysInMonth} days.`,
    `Hourly rate = monthly salary ÷ ${daysInMonth} ÷ 9. Overtime ${hmTotal(s.otMin)} is added and short hours ${hmTotal(s.shortMin)} are cut at this rate.`,
    `Pay = monthly salary ÷ ${daysInMonth} × ${s.payable} payable days + overtime - short hours, before PF / ESIC / PT and other deductions.`,
  ]
  if (e.fieldStaff) lines.push('Field staff: the 4h 30m, late, short-hours and overtime rules do not apply.')
  return lines
}

interface RpcRow {
  employee_id: string
  d: string
  status: DayStatus
  reason: string | null
  pairs: [string | null, string | null][] | null
  worked_minutes: number | null
  late_minutes: number | null
  sched_start: string | null
  early_minutes: number | null
  ot_minutes: number | null
  short_minutes: number | null
  is_late: boolean
  long_shift: boolean
}

export function monthRange(month: string) {
  const start = parseISO(`${month}-01`)
  return {
    from: format(startOfMonth(start), 'yyyy-MM-dd'),
    to: format(endOfMonth(start), 'yyyy-MM-dd'),
    monthLabel: format(start, 'MMMM yyyy'),
  }
}

// mine: the signed-in employee's own month (public.my_attendance_month)
// instead of the admin / HR report for an outlet.
export async function loadMonthReport(
  month: string,
  outletId: string | null,
  opts: { mine?: boolean; employeeId?: string } = {},
): Promise<MonthReport> {
  const { from, to, monthLabel } = monthRange(month)

  // Page until an empty page comes back: the API caps rows per request, and
  // stopping at the first short page is what cut the old report off at ~15
  // days.
  const rows: RpcRow[] = []
  for (let page = 0; page < 100; page++) {
    const q = opts.mine
      ? supabase.rpc('my_attendance_month', { p_from: from, p_to: to })
      : supabase.rpc('attendance_month_report', { p_from: from, p_to: to, p_outlet: outletId })
    const { data, error } = await q.range(rows.length, rows.length + 999)
    if (error) throw new Error(error.message)
    const got = (data ?? []) as RpcRow[]
    if (!got.length) break
    rows.push(...got)
  }

  if (opts.employeeId) {
    const keep = rows.filter((r) => r.employee_id === opts.employeeId)
    rows.length = 0
    rows.push(...keep)
  }
  const ids = [...new Set(rows.map((r) => r.employee_id))]
  const emps = new Map<
    string,
    {
      employee_code: string
      full_name: string
      phone: string | null
      outlet_name: string | null
      designation_name: string | null
      field_staff: boolean | null
    }
  >()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('v_employees')
      .select('id, employee_code, full_name, phone, outlet_name, designation_name, field_staff')
      .in('id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const e of data ?? []) emps.set(e.id, e)
  }

  const byEmp = new Map<string, RpcRow[]>()
  for (const r of rows) byEmp.set(r.employee_id, [...(byEmp.get(r.employee_id) ?? []), r])

  const employees: ReportEmployee[] = []
  for (const [id, list] of byEmp) {
    const e = emps.get(id)
    if (!e) continue
    list.sort((a, b) => a.d.localeCompare(b.d))
    let lateCount = 0
    const days: ReportDay[] = list.map((r) => {
      const flags: Flag[] = []
      if (r.status === 'A') flags.push('absent')
      if (r.status === 'HD') flags.push('half')
      if (r.is_late) {
        lateCount++
        flags.push('late')
        if (lateCount % 3 === 0) flags.push('late_cut')
      }
      if ((r.short_minutes ?? 0) > 0) flags.push('short')
      if (r.long_shift) flags.push('long')
      return {
        date: r.d,
        status: r.status,
        reason: r.reason,
        pairs: r.pairs ?? [],
        workedMin: r.worked_minutes,
        lateMin: r.is_late ? r.late_minutes : null,
        schedStart: r.sched_start,
        earlyMin: r.early_minutes && r.early_minutes > 0 ? r.early_minutes : null,
        otMin: r.ot_minutes ?? 0,
        shortMin: r.short_minutes ?? 0,
        isLate: r.is_late,
        longShift: r.long_shift,
        flags,
      }
    })
    const n = (s: DayStatus) => days.filter((d) => d.status === s).length
    const lates = days.filter((d) => d.isLate).length
    const lateCut = Math.floor(lates / 3) * 0.5
    const present = n('P')
    const halfDays = n('HD')
    const weekOff = n('WO')
    const paidLeave = n('PL')
    employees.push({
      id,
      code: e.employee_code,
      name: e.full_name,
      phone: e.phone,
      outlet: e.outlet_name,
      designation: e.designation_name,
      fieldStaff: !!e.field_staff,
      days,
      summary: {
        payable: Math.max(present + halfDays / 2 + paidLeave + weekOff - lateCut, 0),
        present,
        halfDays,
        absent: n('A'),
        weekOff,
        paidLeave,
        unpaidLeave: n('UPL'),
        lates,
        lateCut,
        workedMin: days.reduce((a, d) => a + (d.workedMin ?? 0), 0),
        lateMin: days.reduce((a, d) => a + (d.lateMin ?? 0), 0),
        earlyMin: days.reduce((a, d) => a + (d.earlyMin ?? 0), 0),
        otMin: days.reduce((a, d) => a + d.otMin, 0),
        shortMin: days.reduce((a, d) => a + d.shortMin, 0),
        longShifts: days.filter((d) => d.longShift).length,
      },
    })
  }
  employees.sort((a, b) => (a.outlet ?? '').localeCompare(b.outlet ?? '') || a.name.localeCompare(b.name))
  return { from, to, monthLabel, employees }
}

export function hm(min: number | null | undefined): string {
  if (!min) return '-'
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`
}

export function hmTotal(min: number): string {
  return `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`
}

export function clock(ts: string | null): string {
  return ts ? formatInTimeZone(ts, IST, 'HH:mm') : '-'
}

function dayCode(d: ReportDay): string {
  return d.status === 'NE' || d.status === 'FUT' ? '-' : d.status
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function fileBase(r: MonthReport, scope: string) {
  return `Attendance_${format(parseISO(r.from), 'MMM_yyyy')}_${scope.replace(/[^A-Za-z0-9]+/g, '_')}`
}

// ---------------------------------------------------------------- Excel

export async function downloadExcel(r: MonthReport, scope: string) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Flax HR'
  const bold = { bold: true }
  const solid = (hex: string) => ({
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: `FF${hex}` },
  })
  const head = solid('D1D5DB')

  // Summary
  const sum = wb.addWorksheet('Summary')
  sum.addRow([COMPANY.name]).font = { bold: true, size: 13 }
  sum.addRow([`Attendance report for the month of ${r.monthLabel}`]).font = { size: 12 }
  sum.addRow([`Generated ${format(new Date(), 'dd-MM-yyyy HH:mm')}`])
  sum.addRow([])
  const sh = sum.addRow([
    'Emp code',
    'Name',
    'Outlet',
    'Designation',
    'Payable days',
    'Present',
    'Half days',
    'Absent',
    'Week off',
    'Paid leave',
    'Unpaid leave',
    'Lates',
    'Late cut (days)',
    'Hours worked',
    'Overtime',
    'Short hours',
    'Shifts over 14h',
  ])
  sh.font = bold
  sh.eachCell((c) => (c.fill = head))
  for (const e of r.employees) {
    const s = e.summary
    sum.addRow([
      e.code,
      e.name,
      e.outlet ?? '',
      e.designation ?? '',
      s.payable,
      s.present,
      s.halfDays,
      s.absent,
      s.weekOff,
      s.paidLeave,
      s.unpaidLeave,
      s.lates,
      s.lateCut,
      hmTotal(s.workedMin),
      hmTotal(s.otMin),
      hmTotal(s.shortMin),
      s.longShifts,
    ])
  }
  ;[11, 26, 20, 22, 12, 9, 10, 8, 10, 10, 12, 7, 13, 13, 11, 11, 14].forEach(
    (w, i) => (sum.getColumn(i + 1).width = w),
  )
  sum.views = [{ state: 'frozen', ySplit: 5 }]

  // One sheet per employee, SalaryBox grid
  const used = new Set<string>()
  for (const e of r.employees) {
    let name = `${e.code} ${e.name}`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`
    used.add(name)
    const ws = wb.addWorksheet(name)
    const s = e.summary
    ws.addRow([COMPANY.name]).font = { bold: true, size: 13 }
    ws.addRow([`Attendance report for the month of ${r.monthLabel}`])
    ws.addRow([])
    const d1 = ws.addRow(['Name', 'Phone', 'Outlet', 'Employee Id', 'Designation', 'Field staff'])
    d1.font = bold
    d1.eachCell((c) => (c.fill = head))
    ws.addRow([
      e.name,
      e.phone ?? '',
      e.outlet ?? '',
      e.code,
      e.designation ?? '',
      e.fieldStaff ? 'Yes' : 'No',
    ])
    ws.addRow([])
    const s1 = ws.addRow([
      'Payable Days',
      'Present',
      'Absent',
      'Half Days',
      'Week Off',
      'Paid Leaves',
      'Unpaid Leaves',
      'Lates',
      'Late cut',
    ])
    s1.font = bold
    s1.eachCell((c) => (c.fill = head))
    ws.addRow([
      s.payable,
      s.present,
      s.absent,
      s.halfDays,
      s.weekOff,
      s.paidLeave,
      s.unpaidLeave,
      s.lates,
      s.lateCut,
    ])
    ws.addRow([])

    const maxPairs = Math.max(1, ...e.days.map((d) => d.pairs.length))
    const dates = ws.addRow(['Date', ...e.days.map((d) => format(parseISO(d.date), 'MMM dd'))])
    dates.font = bold
    dates.eachCell((c) => (c.fill = head))
    ws.addRow(['Day', ...e.days.map((d) => format(parseISO(d.date), 'EEE'))])
    const st = ws.addRow(['Status', ...e.days.map(dayCode)])
    st.font = bold
    e.days.forEach((d, i) => {
      const cell = st.getCell(i + 2)
      const fill = STATUS_FILL[d.status]
      if (fill) cell.fill = solid(fill)
      const notes: string[] = []
      if (d.reason) notes.push(d.reason)
      if (d.isLate) notes.push(`Late ${hm(d.lateMin)}`)
      if (d.flags.includes('late_cut')) notes.push('3rd late: half day cut')
      if (d.longShift) notes.push('Shift over 14h')
      if (notes.length) cell.note = notes.join('\n')
    })
    for (let p = 0; p < maxPairs; p++) {
      ws.addRow([maxPairs > 1 ? `In ${p + 1}` : 'In', ...e.days.map((d) => clock(d.pairs[p]?.[0] ?? null))])
      ws.addRow([maxPairs > 1 ? `Out ${p + 1}` : 'Out', ...e.days.map((d) => clock(d.pairs[p]?.[1] ?? null))])
    }
    ws.addRow([`Hrs Worked (${hmTotal(s.workedMin)})`, ...e.days.map((d) => hm(d.workedMin))])
    const lr = ws.addRow([`Late Hrs (${hmTotal(s.lateMin)})`, ...e.days.map((d) => hm(d.lateMin))])
    e.days.forEach((d, i) => d.isLate && (lr.getCell(i + 2).fill = solid('FEF9C3')))
    ws.addRow([`Early Hrs (${hmTotal(s.earlyMin)})`, ...e.days.map((d) => hm(d.earlyMin))])
    const sr = ws.addRow([`Short Hrs (${hmTotal(s.shortMin)})`, ...e.days.map((d) => hm(d.shortMin))])
    e.days.forEach((d, i) => d.shortMin > 0 && (sr.getCell(i + 2).fill = solid('E0F2FE')))
    const ot = ws.addRow([`Overtime Hrs (${hmTotal(s.otMin)})`, ...e.days.map((d) => hm(d.otMin))])
    e.days.forEach((d, i) => d.longShift && (ot.getCell(i + 2).fill = solid('EDE9FE')))
    ws.addRow(['Remarks', ...e.days.map((d) => d.reason ?? '')])
    ws.addRow([])
    ws.addRow(['How this month was calculated']).font = bold
    for (const line of calculationLines(e, e.days.length)) ws.addRow([line])
    ws.addRow([])
    ws.addRow([
      'Note: P Present, HD Half day, A Absent, WO Week off, PL Paid leave, UPL Unpaid leave. Hover a status cell for why it was marked. See the "Rules & legend" sheet.',
    ])
    ws.getColumn(1).width = 20
    for (let i = 2; i <= e.days.length + 1; i++) ws.getColumn(i).width = 8
  }

  // Rules & legend
  const rl = wb.addWorksheet('Rules & legend')
  rl.addRow(['Attendance rules']).font = { bold: true, size: 13 }
  RULES.forEach((t, i) => rl.addRow([`${i + 1}.`, t]))
  rl.addRow([])
  rl.addRow(['Status codes']).font = { bold: true, size: 13 }
  for (const k of ['P', 'HD', 'A', 'WO', 'PL', 'UPL'] as DayStatus[]) {
    const row = rl.addRow([k, STATUS_LABEL[k]])
    const fill = STATUS_FILL[k]
    if (fill) row.getCell(1).fill = solid(fill)
  }
  rl.addRow([])
  rl.addRow(['Rule-break markers']).font = { bold: true, size: 13 }
  for (const f of FLAGS) {
    const row = rl.addRow(['', f.label])
    row.getCell(1).fill = solid(f.color)
  }
  rl.addRow([])
  rl.addRow(['Examples (₹18,000 salary, 31-day month)']).font = { bold: true, size: 13 }
  RULE_EXAMPLES.forEach((t) => rl.addRow(['•', t]))
  rl.getColumn(1).width = 8
  rl.getColumn(2).width = 140

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer
  save(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase(r, scope)}.xlsx`,
  )
}

// ---------------------------------------------------------------- PDF

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(COMPANY.logo)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// The PDF's built-in font has no rupee sign.
const pdfText = (t: string) => t.replace(/₹/g, 'Rs ')

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
]

export async function downloadPdf(r: MonthReport, scope: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const logo = await loadLogo()
  const W = 297
  const M = 8
  const today = format(new Date(), 'dd-MM-yyyy')

  const header = () => {
    if (logo) doc.addImage(logo, 'JPEG', M, 6, 20, 20)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(13)
    doc.text(COMPANY.name, W / 2 - 10, 13, { align: 'center' })
    doc.setFontSize(12)
    doc.text(`ATTENDANCE REPORT FOR THE MONTH of ${r.monthLabel}`, W / 2 - 10, 20, { align: 'center' })
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`Report Date: `, W - M - 58, 8)
    doc.setFont('helvetica', 'normal')
    doc.text(today, W - M - 43, 8)
    doc.setFont('helvetica', 'bold')
    doc.text('Address:', W - M - 58, 11.5)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(COMPANY.address, 58), W - M - 58, 14.5)
    doc.setFont('helvetica', 'bold')
    doc.text('Gstin: ', W - M - 58, 27)
    doc.setFont('helvetica', 'normal')
    doc.text(COMPANY.gstin, W - M - 50, 27)
    doc.setDrawColor(210, 210, 210)
    doc.line(M, 30, W - M, 30)
  }

  // A simple table: rows of cells with fixed column widths.
  const table = (x: number, y: number, widths: number[], rows: string[][], headFill = true, rowH = 6) => {
    rows.forEach((row, ri) => {
      let cx = x
      row.forEach((txt, ci) => {
        const w = widths[ci]
        if (ri === 0 && headFill) {
          doc.setFillColor(209, 213, 219)
          doc.rect(cx, y, w, rowH, 'F')
        }
        doc.setDrawColor(200, 200, 200)
        doc.rect(cx, y, w, rowH)
        doc.setFont('helvetica', ri === 0 && headFill ? 'bold' : 'normal')
        doc.setFontSize(6.5)
        const lines = doc.splitTextToSize(txt, w - 2).slice(0, 2)
        doc.text(lines, cx + 1.2, y + (lines.length > 1 ? 2.6 : 4))
        cx += w
      })
      y += rowH
    })
    return y
  }

  r.employees.forEach((e, idx) => {
    if (idx > 0) doc.addPage()
    header()
    const s = e.summary
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Employee Details', M, 36)
    let y = table(
      M,
      38,
      [50, 26, 60, 26, 60, 23, 36],
      [
        [
          'Name',
          'Phone Number',
          'Outlet',
          'Employee Id',
          'Designation',
          'Field staff',
          'Scheduled Working Hours',
        ],
        [
          e.name,
          e.phone ?? '-',
          e.outlet ?? '-',
          e.code,
          e.designation ?? '-',
          e.fieldStaff ? 'Yes' : 'No',
          '9h / day incl. break',
        ],
      ],
    )
    doc.setFontSize(10)
    doc.text('Attendance summary', M, y + 6)
    y = table(
      M,
      y + 8,
      [31, 31, 31, 31, 31, 31, 31, 31, 23],
      [
        [
          'Payable Days',
          'Present',
          'Absent',
          'Half Days',
          'Week Off',
          'Paid Leaves',
          'Unpaid Leaves',
          'Lates',
          'Late cut',
        ],
        [
          String(s.payable),
          String(s.present),
          String(s.absent),
          String(s.halfDays),
          String(s.weekOff),
          String(s.paidLeave),
          String(s.unpaidLeave),
          String(s.lates),
          String(s.lateCut),
        ],
      ],
    )

    // Day grid
    y += 3
    const labelW = 24
    const n = e.days.length
    const cw = (W - 2 * M - labelW) / n
    const maxPairs = Math.min(2, Math.max(1, ...e.days.map((d) => d.pairs.length)))
    type GridRow = { label: string; h: number; cell: (d: ReportDay) => string[] }
    const rows: GridRow[] = [
      { label: 'Date', h: 7, cell: (d) => [format(parseISO(d.date), 'MMM'), format(parseISO(d.date), 'dd')] },
      { label: 'Day', h: 5, cell: (d) => [format(parseISO(d.date), 'EEE')] },
      { label: 'Status', h: 6, cell: (d) => [dayCode(d)] },
      ...Array.from({ length: maxPairs }, (_, p) => ({
        label: maxPairs > 1 ? `In / Out ${p + 1}` : 'In / Out',
        h: 7,
        cell: (d: ReportDay) => {
          const pr = d.pairs[p]
          return pr ? [clock(pr[0]), clock(pr[1])] : ['-']
        },
      })),
      { label: `Hrs Worked ${hmTotal(s.workedMin)}`, h: 7, cell: (d) => [hm(d.workedMin)] },
      { label: `Late Hrs ${hmTotal(s.lateMin)}`, h: 7, cell: (d) => [hm(d.lateMin)] },
      { label: `Early Hrs ${hmTotal(s.earlyMin)}`, h: 7, cell: (d) => [hm(d.earlyMin)] },
      { label: `Short Hrs ${hmTotal(s.shortMin)}`, h: 7, cell: (d) => [hm(d.shortMin)] },
      { label: `Overtime ${hmTotal(s.otMin)}`, h: 7, cell: (d) => [hm(d.otMin)] },
    ]
    for (const row of rows) {
      const head = row.label === 'Date'
      if (head) {
        doc.setFillColor(209, 213, 219)
        doc.rect(M, y, W - 2 * M, row.h, 'F')
      }
      doc.setDrawColor(200, 200, 200)
      doc.rect(M, y, labelW, row.h)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(5.8)
      doc.setTextColor(40, 40, 40)
      doc.text(doc.splitTextToSize(row.label, labelW - 2).slice(0, 2), M + 1, y + 2.8)
      e.days.forEach((d, i) => {
        const cx = M + labelW + i * cw
        if (row.label === 'Status') {
          const fill = STATUS_FILL[d.status]
          if (fill) {
            doc.setFillColor(...rgb(fill))
            doc.rect(cx, y, cw, row.h, 'F')
          }
        }
        doc.setDrawColor(200, 200, 200)
        doc.rect(cx, y, cw, row.h)
        doc.setFont('helvetica', head || row.label === 'Status' ? 'bold' : 'normal')
        doc.setFontSize(5.6)
        const lines = row.cell(d)
        doc.text(lines, cx + cw / 2, y + (lines.length > 1 ? 2.8 : row.h / 2 + 1), { align: 'center' })
        // Rule-break markers: a small coloured dot per rule in the status
        // cell's top corner.
        if (row.label === 'Status' && d.flags.length) {
          d.flags.forEach((f, k) => {
            const color = FLAGS.find((x) => x.flag === f)?.color ?? '000000'
            doc.setFillColor(...rgb(color))
            doc.circle(cx + cw - 1.1 - k * 1.7, y + 1.1, 0.7, 'F')
          })
        }
      })
      y += row.h
    }

    // Reasons for half days and long shifts, so the page explains itself.
    const notes = e.days
      .filter((d) => d.reason || d.isLate || d.longShift)
      .map((d) => {
        const bits = [
          d.reason,
          d.isLate ? `late ${hm(d.lateMin)}` : null,
          d.longShift ? 'shift over 14h' : null,
        ]
        return `${format(parseISO(d.date), 'dd MMM')}: ${bits.filter(Boolean).join(', ')}`
      })
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.3)
    if (notes.length) {
      const text = doc.splitTextToSize(`Remarks — ${notes.join('  |  ')}`, W - 2 * M)
      doc.text(text.slice(0, 4), M, y)
      y += Math.min(text.length, 4) * 2.8 + 1.5
    }

    // How the month was calculated
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('How this month was calculated', M, y + 1)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    y += 4
    for (const line of calculationLines(e, e.days.length)) {
      const t = doc.splitTextToSize(`• ${line}`, W - 2 * M)
      doc.text(t, M, y)
      y += t.length * 2.9
    }
    y += 2.5

    // Legend
    doc.setFont('helvetica', 'bold')
    doc.text('Legend:', M, y + 1)
    doc.setFont('helvetica', 'normal')
    let lx = M + 11
    for (const f of FLAGS) {
      doc.setFillColor(...rgb(f.color))
      doc.circle(lx, y + 0.3, 0.9, 'F')
      doc.text(f.label, lx + 1.8, y + 1)
      lx += doc.getTextWidth(f.label) + 6
      if (lx > W - M - 40) {
        lx = M + 11
        y += 3.2
      }
    }
    y += 4
    doc.text(
      'P Present · HD Half day · A Absent · WO Week off · PL Paid leave · UPL Unpaid leave · Rules are on the last page.',
      M,
      y + 1,
    )
  })

  // Rules page
  doc.addPage()
  header()
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Attendance rules', M, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  let y = 47
  RULES.forEach((t, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${t}`, W - 2 * M)
    doc.text(lines, M, y)
    y += lines.length * 4 + 1.5
  })
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Rule-break markers on a day', M, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  y += 6
  for (const f of FLAGS) {
    doc.setFillColor(...rgb(f.color))
    doc.circle(M + 2, y - 1.2, 1.3, 'F')
    doc.text(f.label, M + 6, y)
    y += 5
  }
  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(pdfText('Examples (₹18,000 salary, 31-day month)'), M, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  y += 6
  for (const t of RULE_EXAMPLES) {
    const lines = doc.splitTextToSize(pdfText(`• ${t}`), W - 2 * M)
    doc.text(lines, M, y)
    y += lines.length * 4 + 1
  }

  save(doc.output('blob'), `${fileBase(r, scope)}.pdf`)
}
