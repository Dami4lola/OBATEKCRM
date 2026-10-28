import { PipelineBoard } from '@/components/pipeline/pipeline-board'
import { RunOutreachProvider } from '@/components/outreach/run-outreach-provider'
import { RunOutreachButton } from '@/components/outreach/run-outreach-button'
import { FindLeadsDialog } from '@/components/outreach/find-leads-dialog'
import { TodaysCallsDialog } from '@/components/outreach/todays-calls-dialog'

export default function DashboardPage() {
  return (
    <RunOutreachProvider>
      <div className="h-full">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Sales Pipeline</h1>
            <p className="text-muted-foreground">
              Drag and drop leads to move them through your pipeline
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <FindLeadsDialog />
            <TodaysCallsDialog />
            <RunOutreachButton />
          </div>
        </div>
        <PipelineBoard />
      </div>
    </RunOutreachProvider>
  )
}
