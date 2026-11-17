import { useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { CardDescription } from '@/components/ui/Card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useCanViewAll } from '@/lib/training'
import { LeaderboardTab, OutletsTab, ScoresTab } from '@/pages/admin/TrainingPage'

type Tab = 'scores' | 'leaderboard' | 'outlets'

// Read-only view of everyone's training for people named as viewers
// (e.g. the Operation Head and Operations Manager), inside their app.
export default function TeamTrainingPage() {
  const can = useCanViewAll()
  const [tab, setTab] = useState<Tab>('scores')
  if (can.isLoading) return <CardDescription>Loading…</CardDescription>
  if (!can.data) return <CardDescription>You don't have access to team training.</CardDescription>
  return (
    <>
      <PageHeader
        title="Team training"
        description="Everyone's training status, scores, outlets and leaderboard."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="scores">Employees</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="outlets">Outlets & awards</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'scores' ? <ScoresTab readOnly /> : null}
      {tab === 'leaderboard' ? <LeaderboardTab readOnly /> : null}
      {tab === 'outlets' ? <OutletsTab readOnly /> : null}
    </>
  )
}
