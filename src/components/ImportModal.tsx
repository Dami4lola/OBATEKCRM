import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileJson, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { Lead, LeadStage } from '@/types/lead';
import { cn } from '@/lib/utils';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (leads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
}

type ImportStatus = 'idle' | 'processing' | 'success' | 'error';

export function ImportModal({ open, onOpenChange, onImport }: ImportModalProps) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStatus('idle');
    setError(null);
    setPreviewCount(0);
  };

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  };

  const parseCSV = (text: string): Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[] => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV file must have headers and at least one row');

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''));
    const leads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const lead: Partial<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>> = { stage: 'new' as LeadStage };

      headers.forEach((header, index) => {
        const value = (values[index] || '').replace(/^["']|["']$/g, '');
        if (header === 'name') lead.name = value;
        else if (header === 'email') lead.email = value;
        else if (header === 'phone') lead.phone = value;
        else if (header === 'company') lead.company = value;
        else if (header === 'value') lead.value = parseFloat(value) || undefined;
        else if (header === 'source') lead.source = value;
        else if (header === 'notes') lead.notes = value;
        else if (header === 'stage') {
          const validStages: LeadStage[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
          if (validStages.includes(value as LeadStage)) {
            lead.stage = value as LeadStage;
          }
        }
      });

      if (lead.name && lead.email) {
        leads.push(lead as Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>);
      }
    }

    return leads;
  };

  const parseJSON = (text: string): Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[] => {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : [data];

    return items
      .filter((item) => item.name && item.email)
      .map((item) => ({
        name: item.name,
        email: item.email,
        phone: item.phone,
        company: item.company,
        value: typeof item.value === 'number' ? item.value : undefined,
        source: item.source,
        notes: item.notes,
        stage: (['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'].includes(item.stage)
          ? item.stage
          : 'new') as LeadStage,
      }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('processing');
    setError(null);

    try {
      const text = await file.text();
      let leads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[];

      if (file.name.endsWith('.json')) {
        leads = parseJSON(text);
      } else if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // For Excel files, we'll treat them as CSV for now
        // A full implementation would use a library like xlsx
        leads = parseCSV(text);
      } else {
        throw new Error('Unsupported file format. Please use JSON or CSV.');
      }

      if (leads.length === 0) {
        throw new Error('No valid leads found in file. Each lead must have at least a name and email.');
      }

      setPreviewCount(leads.length);
      setStatus('success');

      // Auto-import after brief delay
      setTimeout(() => {
        onImport(leads);
        onOpenChange(false);
        resetState();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setStatus('error');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { onOpenChange(open); if (!open) resetState(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Upload a CSV or JSON file containing your leads data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload Area */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              status === 'idle' && 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer',
              status === 'processing' && 'border-primary/50 bg-primary/5',
              status === 'success' && 'border-success bg-success/10',
              status === 'error' && 'border-destructive bg-destructive/10'
            )}
            onClick={() => status === 'idle' && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />

            {status === 'idle' && (
              <>
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium text-foreground">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground mt-1">CSV, JSON, or Excel files</p>
              </>
            )}

            {status === 'processing' && (
              <>
                <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="font-medium text-foreground">Processing file...</p>
              </>
            )}

            {status === 'success' && (
              <>
                <Check className="w-10 h-10 mx-auto mb-3 text-success" />
                <p className="font-medium text-foreground">Found {previewCount} leads!</p>
                <p className="text-sm text-muted-foreground mt-1">Importing...</p>
              </>
            )}

            {status === 'error' && (
              <>
                <AlertCircle className="w-10 h-10 mx-auto mb-3 text-destructive" />
                <p className="font-medium text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={(e) => { e.stopPropagation(); resetState(); }}
                >
                  Try again
                </Button>
              </>
            )}
          </div>

          {/* Format Examples */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-secondary/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">CSV Format</span>
              </div>
              <code className="text-xs text-muted-foreground block">
                name,email,company,value
              </code>
            </div>
            <div className="p-3 bg-secondary/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileJson className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">JSON Format</span>
              </div>
              <code className="text-xs text-muted-foreground block">
                {'[{"name":"..."}]'}
              </code>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
