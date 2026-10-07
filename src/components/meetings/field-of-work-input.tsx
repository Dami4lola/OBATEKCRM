'use client'

import { useState } from 'react'
import { List } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FIELDS_OF_WORK } from '@/lib/validations/meeting'

const OTHER_VALUE = '__other__'

interface FieldOfWorkInputProps {
  value: string | undefined
  onChange: (value: string) => void
}

// Predefined list of fields, with an "Other…" option that switches to free text
export function FieldOfWorkInput({ value, onChange }: FieldOfWorkInputProps) {
  const [isCustom, setIsCustom] = useState(false)
  // A saved value that isn't in the list is shown as free text
  const showCustom = isCustom || (!!value && !FIELDS_OF_WORK.includes(value))

  if (showCustom) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="Type a field of work"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 px-2 text-xs"
          onClick={() => {
            setIsCustom(false)
            onChange('')
          }}
        >
          <List className="h-3 w-3 mr-1" />
          List
        </Button>
      </div>
    )
  }

  return (
    <Select
      value={value ?? ''}
      onValueChange={(val) => {
        if (val === OTHER_VALUE) {
          setIsCustom(true)
          onChange('')
        } else {
          onChange(val)
        }
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select field" />
      </SelectTrigger>
      <SelectContent>
        {FIELDS_OF_WORK.map((f) => (
          <SelectItem key={f} value={f}>
            {f}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={OTHER_VALUE}>Other…</SelectItem>
      </SelectContent>
    </Select>
  )
}
