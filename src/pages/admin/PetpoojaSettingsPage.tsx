import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  useDeletePetpoojaRestaurant,
  usePetpoojaRestaurants,
  useUpsertPetpoojaRestaurant,
} from '@/lib/petpooja'
import { humanErr } from '@/lib/humanErr'

interface OutletOption { id: string; display_name: string | null }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const WEBHOOK_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/petpooja-order`

export default function PetpoojaSettingsPage() {
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

  const { data: mappings = [], isLoading } = usePetpoojaRestaurants()
  const upsert = useUpsertPetpoojaRestaurant()
  const del = useDeletePetpoojaRestaurant()

  const outletById = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of outletsQ.data ?? []) m.set(o.id, o.display_name ?? o.id)
    return m
  }, [outletsQ.data])

  const [newRestId, setNewRestId] = useState('')
  const [newOutletId, setNewOutletId] = useState('')
  const [newToken, setNewToken] = useState('')

  async function addMapping(e: React.FormEvent) {
    e.preventDefault()
    if (!newRestId.trim() || !newOutletId) {
      toast.error('Restaurant ID and outlet are required')
      return
    }
    try {
      await upsert.mutateAsync({
        rest_id: newRestId,
        outlet_id: newOutletId,
        token: newToken,
      })
      toast.success('Mapping saved')
      setNewRestId('')
      setNewToken('')
    } catch (err) {
      toast.error(humanErr(err, 'Save failed'))
    }
  }

  async function removeMapping(rest_id: string) {
    if (!window.confirm(`Remove Petpooja mapping for ${rest_id}?`)) return
    try {
      await del.mutateAsync(rest_id)
      toast.success('Removed')
    } catch (err) {
      toast.error(humanErr(err, 'Delete failed'))
    }
  }

  function copyWebhook() {
    void navigator.clipboard.writeText(WEBHOOK_URL)
    toast.success('Webhook URL copied')
  }

  return (
    <>
      <PageHeader
        title="Petpooja integration"
        description="Real-time sales into the Sales page. Configure the webhook once, then map each restaurant."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>
            Give this URL to Petpooja support to enable the Global API.
          </CardDescription>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
              {WEBHOOK_URL}
            </code>
            <Button size="sm" variant="outline" onClick={copyWebhook}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>Add mapping</CardTitle>
          <CardDescription>
            Restaurant ID is Petpooja's <span className="font-mono">restID</span>{' '}
            (e.g. <span className="font-mono">cp81ghin</span>). Token is optional
            — if you configure one at Petpooja's end, put the same value here
            and the webhook will reject any push with a different or missing token.
          </CardDescription>
          <form className="grid gap-3 sm:grid-cols-4" onSubmit={addMapping}>
            <Input
              placeholder="Petpooja restID"
              value={newRestId}
              onChange={(e) => setNewRestId(e.target.value)}
              required
            />
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              value={newOutletId}
              onChange={(e) => setNewOutletId(e.target.value)}
              required
            >
              <option value="">— outlet —</option>
              {outletsQ.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name ?? o.id}
                </option>
              ))}
            </select>
            <Input
              placeholder="Token (optional)"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
            />
            <Button type="submit" loading={upsert.isPending}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-6 pb-3">
            <CardTitle>Mappings</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading…' : `${mappings.length} restaurant(s) mapped`}
            </CardDescription>
          </div>
          {mappings.length === 0 && !isLoading ? (
            <div className="p-6 pt-3 text-sm text-muted-foreground">
              No Petpooja restaurants mapped yet. Add one above.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {mappings.map((m) => (
                <li key={m.rest_id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-sm">{m.rest_id}</span>
                    <span className="text-xs text-muted-foreground">
                      → {outletById.get(m.outlet_id) ?? m.outlet_id}
                      {m.token ? ' · token set' : ' · no token'}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMapping(m.rest_id)}
                    aria-label="Delete mapping"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
