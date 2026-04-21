import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { isValidEmail, parseEmails } from '@/lib/identity'

const SLUG_REGEX = /^[a-z][a-z0-9_]{1,30}$/

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
}

export default function NewOutletPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [city, setCity] = useState('Mumbai')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [emails, setEmails] = useState('')
  const [active, setActive] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Auto-derive id from display_name unless user has edited id manually
  useEffect(() => {
    if (!idTouched) setId(slugify(displayName))
  }, [displayName, idTouched])

  // Auto-prefill name as "Flax - <display_name>"
  useEffect(() => {
    if (!name && displayName) {
      setName(`Flax - ${displayName.trim()}`)
    }
  }, [displayName, name])

  const create = useMutation({
    mutationFn: async () => {
      const parsedEmails = parseEmails(emails)
      const payload = {
        id: id.trim(),
        display_name: displayName.trim(),
        name: name.trim() || `Flax - ${displayName.trim()}`,
        city: city.trim() || null,
        timezone: timezone.trim() || 'Asia/Kolkata',
        emails: parsedEmails,
        active,
      }
      const { error } = await supabase.from('flax_outlets').insert(payload)
      if (error) throw error
      return payload
    },
    onSuccess: (payload) => {
      qc.invalidateQueries({ queryKey: ['outlets-all'] })
      qc.invalidateQueries({ queryKey: ['outlets'] })
      toast.success(`Outlet created: ${payload.display_name}`)
      // Go straight to the edit page so they can drop coordinates next
      navigate(`/admin/outlets/${payload.id}`)
    },
    onError: (e: Error) => {
      const msg = e.message.includes('duplicate')
        ? `An outlet with id "${id}" already exists. Pick a different id.`
        : e.message
      setErr(msg)
      toast.error(msg)
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!displayName.trim()) return setErr('Display name is required.')
    if (!SLUG_REGEX.test(id)) {
      return setErr(
        'Outlet id must start with a letter, be 2–31 chars, and use only lowercase letters, digits and underscores.',
      )
    }
    if (!city.trim()) return setErr('City is required.')
    const parsedEmails = parseEmails(emails)
    const bad = parsedEmails.find((e) => !isValidEmail(e))
    if (bad) return setErr(`"${bad}" is not a valid email address.`)
    create.mutate()
  }

  return (
    <>
      <PageHeader
        title="New outlet"
        description="Create the outlet record first. You'll drop coordinates + geofence on the next screen."
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/outlets')}>
            Back
          </Button>
        }
      />
      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="dn">Display name</Label>
              <Input
                id="dn"
                placeholder="e.g. Lower Parel 2"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Shown everywhere in the app and in complaint / roster tools.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="id">Outlet id (slug)</Label>
              <Input
                id="id"
                placeholder="lower_parel_2"
                value={id}
                onChange={(e) => {
                  setIdTouched(true)
                  setId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }}
                required
              />
              <p className="text-xs text-muted-foreground">
                Primary key. Used by other Flax apps to reference this outlet. Lowercase, digits, underscore only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                placeholder="Flax - Lower Parel 2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Auto-derived from display name. You can override.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Timezone</Label>
              <Input
                id="tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="emails">Contact emails</Label>
              <Input
                id="emails"
                placeholder="manager@flaxitup.com, store.bandra@flaxitup.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. These are the outlet mailboxes used by complaint / ops tools.
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Status</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus-visible:ring-ring"
                />
                Outlet is active
              </label>
            </div>

            {err ? <p className="sm:col-span-2 text-sm text-destructive">{err}</p> : null}

            <div className="sm:col-span-2 flex items-center gap-2 pt-2">
              <Button type="submit" loading={create.isPending}>
                Create outlet
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/admin/outlets')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
