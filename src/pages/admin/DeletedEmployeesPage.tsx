import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArchiveRestore } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface DeletedEmployee {
  id: string
  employee_code: string
  full_name: string
  personal_email: string | null
  phone: string | null
  outlet_name: string | null
  deleted_at: string
  exit_date: string | null
  exit_reason: string | null
}

export default function DeletedEmployeesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery<DeletedEmployee[]>({
    queryKey: ['deleted-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_deleted_employees')
        .select('id, employee_code, full_name, personal_email, phone, outlet_name, deleted_at, exit_date, exit_reason')
      if (error) throw error
      return (data ?? []) as DeletedEmployee[]
    },
  })

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('restore_employee', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deleted-employees'] })
      qc.invalidateQueries({ queryKey: ['employees-list'] })
      toast.success('Employee restored')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <PageHeader
        title="Deleted employees"
        description="Soft-deleted records. Restore to bring them back into the directory and re-enable login."
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/employees')}>
            Back to employees
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Outlet</th>
                  <th className="px-4 py-2.5">Phone</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Exit reason</th>
                  <th className="px-4 py-2.5">Deleted</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No deleted employees.</td></tr>
                ) : (
                  data.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{e.employee_code}</td>
                      <td className="px-4 py-3 font-medium">{e.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.outlet_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.personal_email ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {e.exit_reason ?? (e.exit_date ? `Exited ${e.exit_date}` : '—')}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {format(new Date(e.deleted_at), 'd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={restore.isPending && restore.variables === e.id}
                          onClick={() => {
                            if (confirm(`Restore ${e.full_name}? They'll reappear in the directory and be able to sign in again.`)) {
                              restore.mutate(e.id)
                            }
                          }}
                        >
                          <ArchiveRestore className="h-4 w-4" /> Restore
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
