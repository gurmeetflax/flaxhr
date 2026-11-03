// After a deploy, an open tab (or the installed app) can still be running
// the previous build, whose lazily loaded files (e.g. the Excel library)
// no longer exist: "Failed to fetch dynamically imported module". When
// that happens, take the waiting service worker if there is one and
// reload into the new version. At most once a minute, so a real outage
// shows its error instead of reload-looping.
const KEY = 'flaxhr-chunk-reload-at'

function recentlyReloaded(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 60_000) return true
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Storage blocked: still reload once; the browser keeps us out of a loop
    // because the next load fetches the new build.
  }
  return false
}

async function reloadIntoNewBuild() {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (reg) {
    await reg.update().catch(() => undefined)
    const next = reg.waiting ?? reg.installing
    if (next) {
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
        once: true,
      })
      next.postMessage({ type: 'SKIP_WAITING' })
      setTimeout(() => window.location.reload(), 4000)
      return
    }
  }
  window.location.reload()
}

export function installChunkReload() {
  window.addEventListener('vite:preloadError', (event) => {
    if (recentlyReloaded()) return
    event.preventDefault()
    void reloadIntoNewBuild()
  })
}
