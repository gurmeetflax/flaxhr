import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useLeaveTypes, useUpsertLeaveType, type LeaveType } from '@/lib/leave'

export default function LeavePoliciesPage() {
  const { data: types = [] } = useLeaveTypes()
  const upsert = useUpsertLeaveType()
  const [edit, setEdit] = useState<Partial<LeaveType> | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!edit?.code || !edit.name) return
    try {
      await upsert.mutateAsync({
        code: edit.code,
        name: edit.name,
        is_paid: edit.is_paid ?? true,
        accrual_per_month: edit.accrual_per_month ?? 0,
        max_balance: edit.max_balance ?? null,
        requires_approval: edit.requires_approval ?? true,
        min_notice_days: edit.min_notice_days ?? 0,
        allow_half_day: edit.allow_half_day ?? true,
        is_active: edit.is_active ?? true,
      })
      toast.success('Saved')
      setEdit(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <>
      <PageHeader
        title="Leave policies"
        description="Define leave types, accrual and notice rules"
        actions={
          <Button size="sm" onClick={() => setEdit({ is_paid: true, accrual_per_month: 0, min_notice_days: 0 })}>
            New leave type
          </Button>
        }
      />
      {edit ? (
        <Card className="mb-4">
          <CardContent className="p-6">
            <CardTitle className="mb-3">{edit.id ? 'Edit' : 'New'} leave type</CardTitle>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
              <label className="flex flex-col gap-1 text-sm">Code
                <Input value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} required disabled={!!edit.id} />
              </label>
              <label className="flex flex-col gap-1 text-sm">Name
                <Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-sm">Accrual / month
                <Input type="number" step="0.01" value={edit.accrual_per_month ?? 0} onChange={(e) => setEdit({ ...edit, accrual_per_month: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">Max balance
                <Input type="number" step="0.01" value={edit.max_balance ?? ''} onChange={(e) => setEdit({ ...edit, max_balance: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">Min notice (days)
                <Input type="number" value={edit.min_notice_days ?? 0} onChange={(e) => setEdit({ ...edit, min_notice_days: Number(e.target.value) })} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.is_paid ?? true} onChange={(e) => setEdit({ ...edit, is_paid: e.target.checked })} /> Paid
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.allow_half_day ?? true} onChange={(e) => setEdit({ ...edit, allow_half_day: e.target.checked })} /> Allow half-day
              </label>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                <Button type="submit" loading={upsert.isPending}>Save</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="p-0">
          {types.length === 0 ? (
            <div className="p-6"><CardDescription>No leave types defined.</CardDescription></div>
          ) : (
            <ul className="divide-y divide-border">
              {types.map((t) => (
                <li key={t.id} className="flex items-center justify-between p-4 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{t.name} <span className="text-xs text-muted-foreground">({t.code})</span></span>
                    <span className="text-xs text-muted-foreground">
                      {t.is_paid ? 'Paid' : 'Unpaid'} · accrual {t.accrual_per_month}/mo
                      {t.max_balance != null ? ` · max ${t.max_balance}` : ''} · {t.min_notice_days}d notice
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEdit(t)}>Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
