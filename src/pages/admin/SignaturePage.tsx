import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, Code2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// Company defaults — hardcoded because they change rarely.
const COMPANY = {
  logo: 'https://pub-fe96f9d958ff4417b2ec076058fc91a1.r2.dev/Flax-logo-transparent.png',
  name: 'Health & Beyond Food Pvt. Ltd',
  address: 'Lower Parel (West), Mumbai',
  cities: 'Mumbai · Bangalore · Goa',
  website: 'www.flaxitup.com',
  emailDomain: 'flaxitup.com',
  accent: '#5B7C4A',
  ink: '#1A2137',
  inkSoft: '#4A5168',
}

interface EmployeeRow {
  id: string
  employee_code: string | null
  full_name: string | null
  first_name: string | null
  phone: string | null
  personal_email: string | null
  designation_name: string | null
}

export default function SignaturePage() {
  const [employeeId, setEmployeeId] = useState('')
  const [nameOverride, setNameOverride] = useState('')
  const [titleOverride, setTitleOverride] = useState('')
  const [phoneOverride, setPhoneOverride] = useState('')
  const [emailOverride, setEmailOverride] = useState('')

  const employeesQ = useQuery<EmployeeRow[]>({
    queryKey: ['signature-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, employee_code, full_name, first_name, phone, personal_email, designation_name')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as EmployeeRow[]
    },
  })

  const selected = employeesQ.data?.find((e) => e.id === employeeId)

  function onPickEmployee(id: string) {
    setEmployeeId(id)
    const e = employeesQ.data?.find((x) => x.id === id)
    if (!e) return
    setNameOverride(e.full_name ?? '')
    setTitleOverride(e.designation_name ?? '')
    setPhoneOverride(formatPhone(e.phone ?? ''))
    setEmailOverride(defaultEmail(e))
  }

  const html = useMemo(
    () =>
      buildSignature({
        name: nameOverride || selected?.full_name || '',
        title: titleOverride || selected?.designation_name || '',
        phone: phoneOverride || formatPhone(selected?.phone ?? ''),
        email: emailOverride || defaultEmail(selected),
      }),
    [nameOverride, titleOverride, phoneOverride, emailOverride, selected],
  )

  async function copyForGmail() {
    if (!selected) {
      toast.error('Pick an employee first')
      return
    }
    try {
      const plain = [
        nameOverride,
        titleOverride,
        phoneOverride,
        emailOverride,
        COMPANY.name,
        COMPANY.address,
        COMPANY.cities,
        COMPANY.website,
      ]
        .filter(Boolean)
        .join('\n')
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      toast.success('Copied — paste into Gmail signature')
    } catch {
      // Fallback: select the rendered node and use execCommand.
      const node = document.getElementById('sig-render')
      if (!node) return
      const range = document.createRange()
      range.selectNodeContents(node)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.execCommand('copy')
      sel?.removeAllRanges()
      toast.success('Copied')
    }
  }

  async function copyHtml() {
    await navigator.clipboard.writeText(html)
    toast.success('HTML copied')
  }

  return (
    <>
      <PageHeader
        title="Email signature"
        description="Pick an employee, review, and copy the signature into their Gmail."
        actions={
          selected ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyHtml}>
                <Code2 className="h-4 w-4" /> Copy HTML
              </Button>
              <Button size="sm" onClick={copyForGmail}>
                <Copy className="h-4 w-4" /> Copy for Gmail
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Employee
          <select
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            value={employeeId}
            onChange={(e) => onPickEmployee(e.target.value)}
          >
            <option value="">— select an employee —</option>
            {(employeesQ.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_code ? `${e.employee_code} · ` : ''}
                {e.full_name}
                {e.designation_name ? ` — ${e.designation_name}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            <Card>
              <CardContent className="p-6">
                <div
                  id="sig-render"
                  className="signature-preview"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="p-6">
                <CardTitle>How to install</CardTitle>
                <CardDescription className="mt-2 text-sm">
                  Copy for Gmail → open Gmail → <b>Settings</b> → <b>See all settings</b> →{' '}
                  <b>General</b> → scroll to <b>Signature</b> → create a new one and paste. Save at
                  the bottom. Ask the employee to select this signature as default for new mails and
                  replies.
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <CardTitle className="text-sm">Fine-tune</CardTitle>
              <Field label="Name" value={nameOverride} onChange={setNameOverride} />
              <Field label="Title" value={titleOverride} onChange={setTitleOverride} />
              <Field label="Phone" value={phoneOverride} onChange={setPhoneOverride} />
              <Field label="Email" value={emailOverride} onChange={setEmailOverride} />
              <div className="mt-2 text-xs text-muted-foreground">
                Overrides here only affect the copied signature. They don't save back to the
                employee record.
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Pick an employee to generate their signature.
          </CardContent>
        </Card>
      )}
    </>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  if (digits.length === 12 && digits.startsWith('91'))
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  return raw
}

function defaultEmail(e: EmployeeRow | null | undefined): string {
  if (!e) return ''
  const personal = (e.personal_email ?? '').trim().toLowerCase()
  if (personal.endsWith(`@${COMPANY.emailDomain}`)) return personal
  const first = (e.first_name ?? e.full_name ?? '').trim().split(/\s+/)[0].toLowerCase()
  return first ? `${first}@${COMPANY.emailDomain}` : personal
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[c]
  })
}

function buildSignature(fields: {
  name: string
  title: string
  phone: string
  email: string
}): string {
  const s = {
    name: escapeHtml(fields.name),
    title: escapeHtml(fields.title),
    phone: escapeHtml(fields.phone),
    email: escapeHtml(fields.email),
    company: escapeHtml(COMPANY.name),
    address: escapeHtml(COMPANY.address),
    cities: escapeHtml(COMPANY.cities),
    website: escapeHtml(COMPANY.website),
    logo: escapeHtml(COMPANY.logo),
  }
  const mailto = 'mailto:' + encodeURIComponent(fields.email)
  const webHref = 'https://' + COMPANY.website.replace(/^https?:\/\//, '')
  return `
<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;color:${COMPANY.ink};font-size:13px;line-height:1.55;">
  <tr>
    <td align="center" style="padding-right:20px;border-right:2px solid ${COMPANY.accent};vertical-align:middle;text-align:center;">
      <img src="${s.logo}" alt="FLAX Healthy Living" width="88" style="display:block;margin:0 auto;max-width:88px;height:auto;">
    </td>
    <td style="padding-left:20px;vertical-align:top;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:${COMPANY.ink};letter-spacing:-0.01em;">${s.name}</div>
      <div style="font-size:13px;font-weight:600;color:${COMPANY.ink};margin-top:2px;">${s.title}</div>
      <div style="height:8px;line-height:8px;">&nbsp;</div>
      <div style="font-size:13px;color:${COMPANY.inkSoft};">${s.phone}</div>
      <div style="font-size:13px;color:${COMPANY.inkSoft};"><a href="${mailto}" style="color:${COMPANY.accent};text-decoration:none;">${s.email}</a></div>
      <div style="font-size:13px;color:${COMPANY.inkSoft};margin-top:2px;">${s.company}</div>
      <div style="font-size:13px;color:${COMPANY.inkSoft};">${s.address}</div>
      <div style="height:6px;line-height:6px;">&nbsp;</div>
      <div style="font-size:12px;font-weight:600;color:${COMPANY.ink};letter-spacing:0.02em;">${s.cities}</div>
      <div style="height:4px;line-height:4px;">&nbsp;</div>
      <div><a href="${escapeHtml(webHref)}" style="color:${COMPANY.accent};text-decoration:none;font-weight:600;font-size:13px;">${s.website}</a></div>
    </td>
  </tr>
</table>`.trim()
}
