import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import {
  useCards,
  useCardReasons,
  useIssueCard,
  type CardColour,
  type CardRow,
} from '@/lib/cards'
import { humanErr } from '@/lib/humanErr'

interface OutletOption { id: string; display_name: string | null }
interface EmployeeOption { id: string; employee_code: string; full_name: string }

const IST = 'Asia/Kolkata'

export default function CardsPage() {
  const [colour, setColour] = useState<CardColour | ''>('')
  const [outletId, setOutletId] = useState('')
  const [showIssue, setShowIssue] = useState(false)

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

  const { data: rows = [], isLoading } = useCards({
    status: 'active',
    colour: colour || null,
    outletId: outletId || null,
  })

  return (
    <>
      <PageHeader
        title="Discipline cards"
        description={isLoading ? 'Loading…' : `${rows.length} active card${rows.length === 1 ? '' : 's'}`}
        actions={
          <Button size="sm" onClick={() => setShowIssue(true)}>
            <Plus className="h-4 w-4" /> Issue card
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={colour}
          onChange={(e) => setColour(e.target.value as CardColour | '')}
        >
          <option value="">All colours</option>
          <option value="yellow">🟡 Yellow</option>
          <option value="red">🔴 Red</option>
          <option value="green">🟢 Green</option>
        </select>
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
        >
          <option value="">All outlets</option>
          {outletsQ.data?.map((o) => (
            <option key={o.id} value={o.id}>{o.display_name ?? o.id}</option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 && !isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              No active cards. New cards from lates / no-shows appear here nightly.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((c) => <CardRowItem key={c.id} card={c} />)}
            </ul>
          )}
        </CardContent>
      </Card>

      {showIssue ? <IssueCardModal onClose={() => setShowIssue(false)} /> : null}
    </>
  )
}

function CardRowItem({ card }: { card: CardRow }) {
  const emoji = card.colour === 'red' ? '🔴' : card.colour === 'green' ? '🟢' : '🟡'
  return (
    <li className="flex items-start justify-between gap-3 p-4 text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">
          {emoji} {card.reason_title}
          {card.source === 'auto' ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">auto</span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {card.employee_name} ({card.employee_code})
          {card.outlet_name ? ` · ${card.outlet_name}` : ''}
        </span>
        {card.notes ? (
          <span className="text-xs text-muted-foreground">{card.notes}</span>
        ) : null}
      </div>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {formatInTimeZone(new Date(card.issued_at), IST, 'dd/MM/yy')}
      </span>
    </li>
  )
}

function IssueCardModal({ onClose }: { onClose: () => void }) {
  const { data: reasons = [] } = useCardReasons()
  const empsQ = useQuery<EmployeeOption[]>({
    queryKey: ['employees-picker'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, employee_code, full_name')
        .eq('is_active', true)
        .order('employee_code')
      if (error) throw error
      return (data ?? []) as EmployeeOption[]
    },
  })

  const [employeeId, setEmployeeId] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [notes, setNotes] = useState('')
  const [incident, setIncident] = useState(new Date().toISOString().slice(0, 10))
  const issue = useIssueCard()

  const reason = reasons.find((r) => r.code === reasonCode)
  const activeReasons = reasons.filter((r) => r.is_active)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeId || !reasonCode) return toast.error('Pick an employee and a reason')
    try {
      await issue.mutateAsync({
        employee_id: employeeId,
        reason_code: reasonCode,
        notes: notes.trim() || undefined,
        incident_date: incident,
      })
      toast.success(`${reason?.colour === 'red' ? '🔴' : reason?.colour === 'green' ? '🟢' : '🟡'} Card issued`)
      onClose()
    } catch (err) {
      toast.error(humanErr(err, 'Issue failed'))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <CardTitle className="mb-4">Issue a card</CardTitle>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <label className="flex flex-col gap-1 text-xs">
            <Label className="text-xs">Employee</Label>
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">— pick employee —</option>
              {empsQ.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employee_code} · {e.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <Label className="text-xs">Reason</Label>
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              required
            >
              <option value="">— pick reason —</option>
              {activeReasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.colour === 'red' ? '🔴' : r.colour === 'green' ? '🟢' : '🟡'} {r.title}
                </option>
              ))}
            </select>
            {reason?.description ? (
              <CardDescription className="mt-1">{reason.description}</CardDescription>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <Label className="text-xs">Incident date</Label>
            <Input type="date" value={incident} onChange={(e) => setIncident(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <Label className="text-xs">Notes (evidence)</Label>
            <textarea
              className="min-h-[60px] rounded-lg border border-border bg-surface p-3 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — what happened, who witnessed, links to CCTV clip, etc."
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={issue.isPending}>Issue card</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
