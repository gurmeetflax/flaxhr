import { toast } from 'sonner'
import { Camera } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { useAppSetting, useSetAppSetting } from '@/lib/appSettings'

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="App-wide toggles. Effective immediately for everyone."
      />
      <div className="flex flex-col gap-4">
        <SelfieRequiredCard />
      </div>
    </>
  )
}

function SelfieRequiredCard() {
  const { data: required = true, isLoading } = useAppSetting<boolean>(
    'selfie_required',
    true,
  )
  const setting = useSetAppSetting()

  const onToggle = async (next: boolean) => {
    try {
      await setting.mutateAsync({ key: 'selfie_required', value: next })
      toast.success(next ? 'Selfie now required on punch' : 'Selfie no longer required')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-6">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Camera className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <CardTitle>Require selfie on punch in/out</CardTitle>
          <CardDescription className="mt-1">
            When on, every punch must include a selfie. Turn off to let
            employees punch with just location.
          </CardDescription>
        </div>
        <Toggle
          checked={!!required}
          disabled={isLoading || setting.isPending}
          onChange={onToggle}
          ariaLabel="Toggle selfie requirement"
        />
      </CardContent>
    </Card>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
        (checked ? 'bg-primary' : 'bg-muted') +
        ' disabled:opacity-50'
      }
    >
      <span
        className={
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
          (checked ? 'translate-x-5' : 'translate-x-0.5')
        }
      />
    </button>
  )
}
