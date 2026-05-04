import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Renders nothing visible itself — registers the PWA service worker and
 * shows a Sonner toast with a "Reload" action whenever a new version of
 * the app is available. This avoids the "stale SW serving cached responses"
 * class of bugs we've hit repeatedly: the user sees a clear nudge instead
 * of mysteriously broken pages.
 */
export default function SwUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.error('[pwa] SW registration failed', err)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    const id = toast('A new version of Flax HR is available', {
      description: 'Reload to pick up the latest fixes.',
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => {
          updateServiceWorker(true)
        },
      },
      onDismiss: () => setNeedRefresh(false),
    })
    return () => {
      toast.dismiss(id)
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
