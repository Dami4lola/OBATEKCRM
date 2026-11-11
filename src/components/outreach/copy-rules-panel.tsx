'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAddCopyRule, useCopyRules, useRemoveCopyRule } from '@/lib/queries/write'

// Standing instructions for Claude, built up from draft feedback, so the
// emails sound like the team that sends them
export function CopyRulesPanel() {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const rules = useCopyRules()
  const addRule = useAddCopyRule()
  const removeRule = useRemoveCopyRule()
  const items = rules.data ?? []

  const handleAdd = async () => {
    if (note.trim().length < 3) return
    try {
      await addRule.mutateAsync(note)
      setNote('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the rule')
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeRule.mutateAsync(id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove the rule')
    }
  }

  return (
    <div className="rounded-md border p-2 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-left font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Writing rules ({items.length})
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Every Claude draft follows these. Add one here, or tick &quot;Remember&quot; when you give
            feedback on a draft.
          </p>
          {rules.error && (
            <p className="text-xs text-destructive">
              {rules.error.message}. Has 011_copy_feedback.sql been run?
            </p>
          )}
          {items.length > 0 && (
            <ul className="space-y-1">
              {items.map((rule) => (
                <li key={rule.id} className="flex items-start gap-2 rounded bg-muted/50 px-2 py-1">
                  <span className="flex-1 text-xs">{rule.note}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {rule.vertical ? rule.vertical.replace(/_/g, ' ') : 'all leads'}
                  </Badge>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(rule.id)}
                    disabled={removeRule.isPending}
                    aria-label="Remove rule"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              maxLength={500}
              placeholder="e.g. Never say they're missing something; talk about the time it costs them"
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" onClick={handleAdd} disabled={note.trim().length < 3 || addRule.isPending}>
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
