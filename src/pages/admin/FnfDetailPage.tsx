import { useNavigate, useParams } from 'react-router-dom'
import { Calculator, CheckCircle2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  useClearanceItems,
  useComputeFnfSettlement,
  useFnfRecord,
  useSettleFnf,
  useUpdateClearanceItem,
  type ItemStatus,
} from '@/lib/fnf'

export default function FnfDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: record } = useFnfRecord(id)
  const { data: items = [] } = useClearanceItems(id)
  const update = useUpdateClearanceItem()
  const compute = useComputeFnfSettlement()
  const settle = useSettleFnf()

  if (!id) return null

  const allDone = items.length > 0 && items.every((i) => i.status !== 'pending')

  async function setItem(itemId: string, status: ItemStatus) {
    try {
      await update.mutateAsync({ id: itemId, status })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function onCompute() {
    try {
      const v = await compute.mutateAsync(id!)
      toast.success(`Settlement computed: ₹${v.toFixed(2)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Compute failed')
    }
  }

  async function onSettle() {
    if (!confirm('Mark FnF as settled? Employee will be notified.')) return
    try {
      await settle.mutateAsync(id!)
      toast.success('Settled')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Settle failed')
    }
  }

  return (
    <>
      <PageHeader
        title={`FnF · ${record?.full_name ?? ''}`}
        description={
          record
            ? `Exit ${record.exit_date} · target ${record.fnf_target_date} · ${record.status}`
            : 'Loading…'
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/fnf')}>
            Back
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <CardTitle>Settlement</CardTitle>
              <CardDescription className="mt-1">
                Last-month prorated salary + leave encashment − outstanding deductions.
              </CardDescription>
              <p className="mt-2 text-2xl font-bold font-mono">
                {record?.final_amount != null
                  ? `₹${Number(record.final_amount).toFixed(2)}`
                  : '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onCompute} loading={compute.isPending}>
                <Calculator className="h-4 w-4" /> Compute
              </Button>
              <Button
                onClick={onSettle}
                loading={settle.isPending}
                disabled={record?.status === 'settled' || !allDone}
              >
                <CheckCircle2 className="h-4 w-4" /> Mark settled
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Clearance checklist</CardTitle>
                <CardDescription className="mt-1">
                  Each owner must mark their item done (or HR may waive).
                </CardDescription>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="flex-1">
                    <span className="font-medium">{it.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      Owner: <span className="capitalize">{it.owner_role}</span>
                    </span>
                  </span>
                  <span className={
                    'rounded-md px-2 py-0.5 text-xs font-medium ' +
                    (it.status === 'done' ? 'bg-primary/10 text-primary' :
                     it.status === 'waived' ? 'bg-muted text-muted-foreground' :
                     'bg-warning/10 text-warning')
                  }>
                    {it.status}
                  </span>
                  {it.status === 'pending' ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setItem(it.id, 'done')}>
                        Mark done
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setItem(it.id, 'waived')}>
                        Waive
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setItem(it.id, 'pending')}>
                      Reopen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
