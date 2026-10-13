import { useState } from 'react'
import { format } from 'date-fns'
import { Download, Eye, FileSignature, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  openSignedPdf,
  directorSignatureDataUrl,
  loadDocContext,
  renderForEmployee,
  useCancelRequest,
  useSendDocuments,
  useSignRequests,
  useTemplates,
  type DocTemplate,
  type SignStatus,
} from '@/lib/documents'
import LetterPreview from './LetterPreview'

const STATUS_STYLE: Record<SignStatus, string> = {
  sent: 'bg-amber-500/10 text-amber-700',
  viewed: 'bg-blue-500/10 text-blue-700',
  signed: 'bg-primary/10 text-primary',
  declined: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
}

// Send documents to one employee for signing, and see their status.
export default function EmployeeDocumentsCard({ employeeId }: { employeeId: string }) {
  const { data: templates = [] } = useTemplates()
  const { data: requests = [] } = useSignRequests({ employeeId })
  const send = useSendDocuments()
  const cancel = useCancelRequest()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [joining, setJoining] = useState('')
  const [preview, setPreview] = useState<{ title: string; html: string; missing: string[] } | null>(null)

  const active = templates.filter((t) => t.is_active)
  const open = new Set(
    requests.filter((r) => r.status === 'sent' || r.status === 'viewed').map((r) => r.kind),
  )
  const chosen = active.filter((t) => picked.has(t.id))

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const onPreview = async (t: DocTemplate) => {
    try {
      const ctx = await loadDocContext(employeeId)
      const sig = await directorSignatureDataUrl(ctx.entity)
      const r = renderForEmployee(t, ctx, sig, t.kind === 'offer_letter' && joining ? joining : undefined)
      setPreview({ title: t.title, html: r.html, missing: r.missing })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed')
    }
  }

  const onSend = async () => {
    try {
      const n = await send.mutateAsync({ employeeId, templates: chosen, joiningDate: joining || undefined })
      toast.success(`${n} document${n === 1 ? '' : 's'} sent for signing`)
      setPicked(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed')
    }
  }

  return (
    <div className="sm:col-span-2 grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <FileSignature className="h-4 w-4 text-primary" />
        <Label>Documents to sign</Label>
      </div>

      {requests.length ? (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface text-sm">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">
                  Sent {format(new Date(r.sent_at), 'd MMM yyyy')}
                  {r.signed_at ? ` · signed ${format(new Date(r.signed_at), 'd MMM yyyy')}` : ''}
                  {r.sign_method === 'aadhaar' ? ' · Aadhaar eSign' : ' · in-app'}
                  {r.declined_reason ? ` · "${r.declined_reason}"` : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}
                >
                  {r.status}
                </span>
                {r.signed_pdf_path ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Download signed PDF"
                    onClick={() => openSignedPdf(r.signed_pdf_path!).catch((e) => toast.error(e.message))}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                ) : null}
                {r.status === 'sent' || r.status === 'viewed' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Cancel"
                    onClick={() => cancel.mutate(r.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
      )}

      <div className="grid gap-1.5">
        {active.map((t) => {
          const isOpen = open.has(t.kind)
          return (
            <label
              key={t.id}
              className={`flex items-center justify-between gap-2 text-sm ${isOpen ? 'opacity-50' : ''}`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={isOpen}
                  checked={picked.has(t.id)}
                  onChange={() => toggle(t.id)}
                />
                {t.title}
                <span className="text-xs text-muted-foreground">
                  {t.sign_method === 'aadhaar' ? 'Aadhaar eSign' : 'in-app'}
                  {isOpen ? ' · already waiting' : ''}
                </span>
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => onPreview(t)}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
            </label>
          )
        })}
      </div>

      {chosen.some((t) => t.kind === 'offer_letter') ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Joining date for the offer letter
          <Input type="date" value={joining} onChange={(e) => setJoining(e.target.value)} />
        </label>
      ) : null}

      <div>
        <Button type="button" size="sm" disabled={!chosen.length} loading={send.isPending} onClick={onSend}>
          <Send className="h-4 w-4" /> Send {chosen.length || ''} for signing
        </Button>
      </div>

      {preview ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Preview: {preview.title}
              {preview.missing.length ? (
                <span className="ml-2 text-xs text-amber-700">
                  Missing details: {preview.missing.join(', ')}
                </span>
              ) : null}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <LetterPreview html={preview.html} />
        </div>
      ) : null}
    </div>
  )
}
