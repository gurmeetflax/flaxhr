import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'

/**
 * Standalone signature generator HTML lives at /signature-generator.html
 * (under public/). We embed it as an iframe so the original styles + JS
 * keep working unmodified.
 */
export default function SignaturePage() {
  return (
    <>
      <PageHeader
        title="Email signature"
        description="Generate your Flax-branded Gmail signature in under a minute."
        actions={
          <a
            href="/signature-generator.html"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            Open in new tab ↗
          </a>
        }
      />
      <Card>
        <CardContent className="p-0">
          <iframe
            src="/signature-generator.html"
            title="Flax signature generator"
            className="block w-full"
            style={{ minHeight: '85vh', border: 0 }}
          />
        </CardContent>
      </Card>
    </>
  )
}
