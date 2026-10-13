import { format, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { hms, STATUS_TEXT, type PeriodRow } from '@/lib/periodAttendance'

const IST = 'Asia/Kolkata'

const HEADERS = [
  'Date',
  'Status',
  'Hours worked (HH:MM:SS)',
  'Late Arrival (HH:MM:SS)',
  'Early Departure (HH:MM:SS)',
  'Overtime (HH:MM:SS)',
  'Notes',
  'Punch in time',
  'Punch out time',
  'Paid',
  'Scheduled Start Time',
  'Scheduled End Time',
  'Punch in location',
  'Punch out location',
]

const FILL: Record<string, string> = {
  absent: 'FFFDE2E2',
  late: 'FFFEF3C7',
  no_out: 'FFFEF3C7',
  short: 'FFFEF3C7',
  week_off: 'FFF4F4F5',
  leave: 'FFDBEAFE',
}

function t(ts: string | null): string {
  return ts ? formatInTimeZone(ts, IST, 'hh:mm a') : ''
}

// One sheet per employee in the SalaryBox month-report layout, plus a
// summary sheet when there's more than one person. exceljs is loaded on
// demand so it stays out of the main bundle.
export async function buildMonthlyWorkbook(rows: PeriodRow[], from: string, to: string): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Flax HR'
  const range = `${format(parseISO(from), 'dd MMMM yyyy')} - ${format(parseISO(to), 'dd MMMM yyyy')}`

  if (rows.length > 1) {
    const ws = wb.addWorksheet('Summary')
    ws.addRow([`Attendance summary (${range})`]).font = { bold: true, size: 13 }
    const head = ws.addRow([
      'Emp code',
      'Name',
      'Outlet',
      'Working days',
      'Present',
      'Late',
      'No punch-out',
      'In/out < 30 min',
      'Absent',
      'Week Off',
      'Leave',
      'Paid days',
      'Hours worked',
      'Overtime',
      'Attendance %',
    ])
    head.font = { bold: true }
    for (const r of rows) {
      const tt = r.totals
      ws.addRow([
        r.employee.employee_code,
        r.employee.full_name,
        r.employee.outlet_name ?? '',
        tt.workingDays,
        tt.present,
        tt.late,
        tt.noOut,
        tt.short,
        tt.absent,
        tt.weekOff,
        tt.leave,
        tt.paidDays,
        hms(tt.workedMin),
        hms(tt.overtimeMin),
        tt.score ?? '',
      ])
    }
    ws.columns.forEach((c, i) => (c.width = i === 1 ? 28 : i === 2 ? 22 : 13))
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }

  const used = new Set<string>()
  for (const r of rows) {
    const e = r.employee
    let name = `${e.employee_code} ${e.full_name}`.replace(/[\\/*?:[\]]/g, '').slice(0, 31)
    while (used.has(name)) name = name.slice(0, 29) + '_' + used.size
    used.add(name)
    const ws = wb.addWorksheet(name)

    ws.mergeCells(1, 1, 1, HEADERS.length)
    const title = ws.getCell(1, 1)
    title.value = `${e.full_name.toUpperCase()} - Month Attendance Report (${range})`
    title.font = { bold: true, size: 13 }
    ws.addRow(HEADERS).font = { bold: true }

    for (const d of r.days) {
      if (d.status === 'not_employed') continue
      const row = ws.addRow([
        format(parseISO(d.date), 'dd-MMM-yyyy'),
        d.status === 'leave' ? `Leave${d.leaveName ? ` (${d.leaveName})` : ''}` : STATUS_TEXT[d.status],
        hms(d.workedMin),
        hms(d.status === 'late' ? d.lateMin : 0),
        hms(d.earlyMin),
        hms(d.overtimeMin),
        d.notes.join(' · '),
        t(d.firstIn),
        t(d.lastOut),
        d.paid == null ? '' : d.paid ? 'Yes' : 'No',
        t(d.schedStart),
        t(d.schedEnd),
        d.inOutlet ?? '',
        d.outOutlet ?? '',
      ])
      const fill = FILL[d.status]
      if (fill) row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    }

    const tt = r.totals
    ws.addRow([])
    ws.addRow(['Summary']).font = { bold: true }
    for (const [k, v] of [
      ['Working days', tt.workingDays],
      ['Present', tt.present + tt.late + tt.noOut],
      ['  of which late', tt.late],
      ['  of which no punch-out', tt.noOut],
      ['In/out < 30 min (not counted)', tt.short],
      ['Absent', tt.absent],
      ['Week Off', tt.weekOff],
      ['Leave', tt.leave],
      ['Paid days', tt.paidDays],
      ['Hours worked', hms(tt.workedMin)],
      ['Late (total)', hms(tt.lateMin)],
      ['Overtime', hms(tt.overtimeMin)],
      ['Attendance %', tt.score ?? '—'],
    ] as [string, string | number][]) {
      ws.addRow([k, v])
    }

    const widths = [14, 18, 14, 14, 14, 14, 40, 13, 13, 7, 13, 13, 24, 24]
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

export async function downloadMonthlySheet(rows: PeriodRow[], from: string, to: string) {
  const buf = await buildMonthlyWorkbook(rows, from, to)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const who = rows.length === 1 ? rows[0].employee.full_name.replace(/\s+/g, '_') : 'all'
  a.download = `attendance_${format(parseISO(from), 'MMM_yyyy')}_${who}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
}
