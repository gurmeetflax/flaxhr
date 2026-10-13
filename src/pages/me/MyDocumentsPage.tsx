import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSignature,
  Fingerprint,
  PenLine,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { createEphemeralClient, supabase } from '@/lib/supabase'
import { useAuth, useMyEmployee } from '@/lib/auth'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { blobToBase64, certificateHtml, fillEmployeeSignature, htmlToPdf, sha256Hex } from '@/lib/signPdf'
import LetterPreview from '@/pages/admin/LetterPreview'
import SignaturePad, { type SignaturePadHandle } from './SignaturePad'

interface MyDoc {
  id: string
  kind: string
  title: string
  sign_method: 'in_app' | 'aadhaar'
  status: 'sent' | 'viewed' | 'signed' | 'declined'
  sent_at: string
  signed_at: string | null
  signed_via: 'in_app' | 'aadhaar' | null
  signed_pdf_path: string | null
  rendered_html: string
  provider_url: string | null
  provider_status: string | null
}

function useMyDocs() {
  return useQuery<MyDoc[]>({
    queryKey: ['my-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_sign_requests')
        .select('*')
        .order('sent_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as MyDoc[]
    },
  })
}

async function errorText(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  const body = ctx ? await ctx.json().catch(() => null) : null
  return body?.error ?? (error instanceof Error ? error.message : 'Something went wrong')
}

export default function MyDocumentsPage() {
  const { data: docs = [], isLoading } = useMyDocs()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = docs.find((d) => d.id === openId) ?? null

  if (open) return <DocumentView doc={open} onBack={() => setOpenId(null)} />

  const pending = docs.filter((d) => d.status === 'sent' || d.status === 'viewed')
  const done = docs.filter((d) => d.status === 'signed')

  return (
    <>
      <PageHeader title="Documents" description="Letters and policies to read and sign" />
      {isLoading ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : null}
      {pending.length ? (
        <Card className="mb-4">
          <CardContent className="flex flex-col gap-2 p-4">
            <CardTitle>To sign ({pending.length})</CardTitle>
            {pending.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setOpenId(d.id)}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-left dark:bg-amber-500/10"
              >
                <span className="flex items-center gap-3">
                  <FileSignature className="h-5 w-5 text-amber-700" />
                  <span>
                    <span className="block font-medium">{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Sent {format(new Date(d.sent_at), 'd MMM')} ·{' '}
                      {d.sign_method === 'aadhaar' ? 'Aadhaar eSign' : 'Sign in the app'}
                    </span>
                  </span>
                </span>
                <span className="text-sm font-medium text-amber-800">Open</span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : !isLoading ? (
        <Card className="mb-4">
          <CardContent className="p-4">
            <CardDescription>Nothing to sign right now.</CardDescription>
          </CardContent>
        </Card>
      ) : null}
      {done.length ? (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <CardTitle>Signed</CardTitle>
            {done.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>
                    <span className="block font-medium">{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.signed_at ? format(new Date(d.signed_at), 'd MMM yyyy') : ''} ·{' '}
                      {d.signed_via === 'aadhaar' ? 'Aadhaar eSign' : 'signed in app'}
                    </span>
                  </span>
                </span>
                {d.signed_pdf_path ? <DownloadSigned path={d.signed_pdf_path} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}

function DownloadSigned({ path }: { path: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        const { data, error } = await supabase.storage.from('signed-docs').createSignedUrl(path, 300)
        if (error) return toast.error(error.message)
        window.open(data.signedUrl, '_blank')
      }}
    >
      <Download className="h-4 w-4" /> PDF
    </Button>
  )
}

function DocumentView({ doc, onBack }: { doc: MyDoc; onBack: () => void }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data: me } = useMyEmployee()
  const pad = useRef<SignaturePadHandle>(null)
  const [mode, setMode] = useState<'read' | 'in_app'>('read')
  const [typedName, setName] = useState<string | null>(null)
  const name = typedName ?? me?.full_name ?? ''
  const [agree, setAgree] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const signed = doc.status === 'signed'
  const aadhaarStarted = !!doc.provider_url

  useEffect(() => {
    if (doc.status === 'sent')
      void supabase
        .rpc('mark_document_viewed', { p_request_id: doc.id })
        .then(() => qc.invalidateQueries({ queryKey: ['my-documents'] }))
  }, [doc.id, doc.status, qc])

  const refresh = () => qc.invalidateQueries({ queryKey: ['my-documents'] })

  const startAadhaar = async () => {
    // Open the tab now (before any await) so the browser doesn't block it.
    const win = doc.provider_url ? null : window.open('', '_blank')
    setBusy('aadhaar')
    try {
      let url = doc.provider_url
      if (!url) {
        const pdf = await htmlToPdf([doc.rendered_html])
        const { data, error } = await supabase.functions.invoke('esign-start', {
          body: { request_id: doc.id, pdf_base64: await blobToBase64(pdf) },
        })
        if (error) throw new Error(await errorText(error))
        url = (data as { url: string }).url
      }
      if (win) win.location.href = url!
      else if (!window.open(url!, '_blank')) window.location.href = url!
      toast.success('Complete the Aadhaar OTP in the page that opened, then come back and tap "I\'ve signed"')
      void refresh()
    } catch (e) {
      win?.close()
      toast.error(e instanceof Error ? e.message : 'Could not start Aadhaar eSign')
    } finally {
      setBusy(null)
    }
  }

  const checkStatus = async () => {
    setBusy('check')
    try {
      const { data, error } = await supabase.functions.invoke('leegality-webhook', {
        body: { request_id: doc.id },
      })
      if (error) throw new Error(await errorText(error))
      const s = data as { status: string; provider_status?: string }
      if (s.status === 'signed') toast.success('Signed — thank you!')
      else
        toast.message(
          `Not signed yet${s.provider_status ? ` (${s.provider_status})` : ''}. Finish the Aadhaar OTP and try again.`,
        )
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not check')
    } finally {
      setBusy(null)
    }
  }

  const signInApp = async () => {
    if (!me || !user?.email) return
    if (!agree) return toast.error('Tick the box to confirm you have read and agree.')
    if (!name.trim()) return toast.error('Type your full name.')
    if (pad.current?.isEmpty()) return toast.error('Draw your signature.')
    if (!pin) return toast.error('Enter your PIN to confirm it is you.')
    setBusy('sign')
    try {
      // Re-confirm identity without touching the current session.
      const { error: authErr } = await createEphemeralClient().auth.signInWithPassword({
        email: user.email,
        password: pin,
      })
      if (authErr) throw new Error('That PIN is not correct.')

      const sigDataUrl = pad.current!.toDataUrl()
      const signedAt = new Date()
      const sha = await sha256Hex(doc.rendered_html)
      const signedOn = `Signed electronically on ${formatInTimeZone(signedAt, 'Asia/Kolkata', 'd MMM yyyy, h:mm a')} IST`
      const pdf = await htmlToPdf([
        fillEmployeeSignature(doc.rendered_html, sigDataUrl, signedOn),
        certificateHtml({
          title: doc.title,
          employeeName: name.trim(),
          employeeCode: me.employee_code,
          requestId: doc.id,
          signedAt,
          sha256: sha,
          signatureDataUrl: sigDataUrl,
          aadhaarFallback: doc.sign_method === 'aadhaar',
        }),
      ])
      const sigPath = `${me.id}/${doc.id}.png`
      const pdfPath = `${me.id}/${doc.id}-signed.pdf`
      const sigBlob = await (await fetch(sigDataUrl)).blob()
      const up1 = await supabase.storage
        .from('signatures')
        .upload(sigPath, sigBlob, { contentType: 'image/png', upsert: false })
      if (up1.error && !/exists/i.test(up1.error.message)) throw up1.error
      const up2 = await supabase.storage
        .from('signed-docs')
        .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false })
      if (up2.error && !/exists/i.test(up2.error.message)) throw up2.error
      const { error } = await supabase.rpc('sign_document_in_app', {
        p_request_id: doc.id,
        p_signer_name: name.trim(),
        p_signature_path: sigPath,
        p_signed_pdf_path: pdfPath,
        p_client: {
          user_agent: navigator.userAgent,
          content_sha256: sha,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      if (error) throw error
      toast.success('Signed — a copy is saved under Documents')
      await refresh()
      onBack()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Signing failed')
    } finally {
      setBusy(null)
      setPin('')
    }
  }

  return (
    <>
      <PageHeader
        title={doc.title}
        description={
          signed
            ? 'Signed'
            : doc.sign_method === 'aadhaar'
              ? 'Read, then sign with Aadhaar'
              : 'Read, then sign below'
        }
        actions={
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />
      <LetterPreview html={doc.rendered_html} />

      {signed ? null : (
        <Card className="mt-4">
          <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
            {doc.sign_method === 'aadhaar' && mode === 'read' ? (
              <>
                <CardTitle>Sign with Aadhaar</CardTitle>
                <CardDescription>
                  You'll get an OTP on the mobile number linked to your Aadhaar (or can use face
                  authentication). It takes about a minute.
                </CardDescription>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={startAadhaar} loading={busy === 'aadhaar'}>
                    <Fingerprint className="h-4 w-4" />{' '}
                    {aadhaarStarted ? 'Open Aadhaar eSign again' : 'Sign with Aadhaar'}
                  </Button>
                  {aadhaarStarted ? (
                    <Button variant="outline" onClick={checkStatus} loading={busy === 'check'}>
                      <RefreshCw className="h-4 w-4" /> I've signed — check
                    </Button>
                  ) : null}
                </div>
                {doc.provider_status && aadhaarStarted ? (
                  <p className="text-xs text-muted-foreground">Status: {doc.provider_status}</p>
                ) : null}
                {aadhaarStarted ? (
                  <button
                    type="button"
                    className="self-start text-sm text-primary underline"
                    onClick={() => setMode('in_app')}
                  >
                    Aadhaar not working (mobile not linked, OTP not coming)? Sign in the app instead
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <CardTitle>Sign</CardTitle>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                  />
                  <span>I have read this document and agree to its terms.</span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Your full name
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <SignaturePad ref={pad} />
                <label className="flex flex-col gap-1 text-sm">
                  Enter your PIN to confirm it's you
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={signInApp} loading={busy === 'sign'}>
                    <PenLine className="h-4 w-4" /> Agree & sign
                  </Button>
                  {doc.sign_method === 'aadhaar' ? (
                    <Button variant="ghost" onClick={() => setMode('read')}>
                      Back to Aadhaar
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
