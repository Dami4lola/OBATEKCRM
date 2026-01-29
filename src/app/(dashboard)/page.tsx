import { PipelineBoard } from '@/components/pipeline/pipeline-board'

export default function DashboardPage() {
  return (
    <div className="h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sales Pipeline</h1>
        <p className="text-muted-foreground">
          Drag and drop leads to move them through your pipeline
        </p>
      </div>
      <PipelineBoard />
    </div>
  )
}
