'use client'

import { useCallback, useState } from 'react'
import { Upload, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { detectFileType } from '@/lib/import/parsers'

interface ImportFileUploadProps {
  onFileSelect: (file: File) => void
  isLoading?: boolean
}

export function ImportFileUpload({ onFileSelect, isLoading }: ImportFileUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateAndSelect = useCallback((file: File) => {
    setError(null)
    const fileType = detectFileType(file)
    if (!fileType) {
      setError('Please upload a CSV, Excel (.xlsx, .xls), or JSON file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB')
      return
    }
    onFileSelect(file)
  }, [onFileSelect])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) {
      validateAndSelect(e.dataTransfer.files[0])
    }
  }, [validateAndSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragActive(false)
  }, [])

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
          dragActive ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-700',
          isLoading && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          className="hidden"
          id="file-upload"
          onChange={(e) => e.target.files?.[0] && validateAndSelect(e.target.files[0])}
          disabled={isLoading}
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Drag and drop your file here, or click to browse
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Supported formats: CSV, Excel (.xlsx, .xls), JSON
          </p>
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}
