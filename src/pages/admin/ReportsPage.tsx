import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Input } from '@/components/ui/Input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import AttendanceExportPanel from './AttendanceExportPanel'
import ScoresPanel from './ScoresPanel'

interface OutletOption {
  id: string
  display_name: string | null
}

type Tab = 'monthly' | 'scores'

// Reports are downloads, not live tables: the monthly attendance report
// (Excel or PDF) and the attendance scores.
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('monthly')
  const last = subMonths(new Date(), 1)
  const [outletId, setOutletId] = useState('')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(format(last, 'yyyy-MM'))

  const outletsQ = useQuery<OutletOption[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select('id, display_name')
        .eq('active', true)
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
  })

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          tab === 'monthly'
            ? 'Monthly attendance report (Excel or PDF)'
            : 'Attendance score per employee, lowest first'
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="monthly">Monthly attendance report</TabsTrigger>
          <TabsTrigger value="scores">Attendance scores</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'monthly' ? (
        <AttendanceExportPanel outlets={outletsQ.data ?? []} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
            >
              <option value="">All outlets</option>
              {outletsQ.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name ?? o.id}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Month
              <Input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </label>
          </div>
          <ScoresPanel month={month} outletId={outletId} search={search} />
        </>
      )}
    </>
  )
}
