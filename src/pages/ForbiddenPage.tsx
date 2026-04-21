import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function ForbiddenPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">403</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Not allowed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account does not have permission to view that page.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button variant="outline">Go home</Button>
        </Link>
      </div>
    </div>
  )
}
