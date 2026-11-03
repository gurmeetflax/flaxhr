import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardTitle } from '@/components/ui/Card'
import { FLAGS, RULE_EXAMPLES, RULES } from '@/lib/attendanceReport'

// Attendance and pay rules for staff to read: the same text the monthly
// attendance report prints, so the two never disagree.
export default function PoliciesPage() {
  return (
    <>
      <PageHeader title="Attendance & pay rules" description="How your days, hours and pay are worked out" />
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="p-6">
            <CardTitle>Rules</CardTitle>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <CardTitle>Examples</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              On a ₹18,000 salary in a 31-day month: one day is ₹580.65 and one hour is ₹64.52.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              {RULE_EXAMPLES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <CardTitle>Marks on your attendance report</CardTitle>
            <ul className="mt-3 space-y-2 text-sm">
              {FLAGS.map((f) => (
                <li key={f.flag} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: `#${f.color}` }}
                  />
                  {f.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              P Present · HD Half day · A Absent · WO Week off · PL Paid leave · UPL Unpaid leave. Missed a
              punch? Use Regularise so the day is counted in full.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
