import { useMyEmployee } from '@/lib/auth'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'

export default function MyDashboard() {
  const { data: employee, isLoading } = useMyEmployee()

  return (
    <>
      <PageHeader
        title={employee?.full_name ? `Hi, ${employee.full_name.split(' ')[0]}` : 'My space'}
        description={employee?.employee_code ? `Employee code ${employee.employee_code}` : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-1 p-6">
            <CardTitle>Punch in / out</CardTitle>
            <CardDescription>Coming in the Attendance module.</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-6">
            <CardTitle>My leaves</CardTitle>
            <CardDescription>Coming in the Leave module.</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-6">
            <CardTitle>My roster</CardTitle>
            <CardDescription>Coming in the Roster module.</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-6">
            <CardTitle>Payslips</CardTitle>
            <CardDescription>Coming in the Payroll module.</CardDescription>
          </CardContent>
        </Card>
      </div>

      {isLoading ? null : employee ? null : (
        <Card className="mt-6">
          <CardContent className="p-6">
            <CardTitle>No employee profile yet</CardTitle>
            <CardDescription className="mt-1">
              Your login works but no employee record is linked. Ask an admin to complete your
              onboarding.
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </>
  )
}
