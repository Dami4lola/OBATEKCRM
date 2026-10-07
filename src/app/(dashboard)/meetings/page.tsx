import { MeetingsBoard } from '@/components/meetings/meetings-board'

export default function MeetingsPage() {
  return (
    <div className="h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Meetings</h1>
        <p className="text-muted-foreground">
          Every meeting logged from the pipeline, across all companies
        </p>
      </div>
      <MeetingsBoard />
    </div>
  )
}
