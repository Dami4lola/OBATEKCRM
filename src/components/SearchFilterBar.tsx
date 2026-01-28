import { LeadFilters, LeadStage, STAGES } from '@/types/lead';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, X, CalendarIcon, Filter, SlidersHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface SearchFilterBarProps {
  filters: LeadFilters;
  onFiltersChange: (filters: LeadFilters) => void;
  totalCount: number;
  filteredCount: number;
}

const stageColors: Record<LeadStage, string> = {
  new: 'bg-stage-new',
  contacted: 'bg-stage-contacted',
  qualified: 'bg-stage-qualified',
  proposal: 'bg-stage-proposal',
  won: 'bg-stage-won',
  lost: 'bg-stage-lost',
};

export function SearchFilterBar({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: SearchFilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters =
    filters.search ||
    filters.stages.length > 0 ||
    filters.dateRange.from ||
    filters.dateRange.to ||
    filters.valueRange.min !== undefined ||
    filters.valueRange.max !== undefined;

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      stages: [],
      dateRange: {},
      valueRange: {},
    });
  };

  const toggleStage = (stage: LeadStage) => {
    const newStages = filters.stages.includes(stage)
      ? filters.stages.filter((s) => s !== stage)
      : [...filters.stages, stage];
    onFiltersChange({ ...filters, stages: newStages });
  };

  return (
    <div className="space-y-3">
      {/* Main Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, email, company..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
          {filters.search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => onFiltersChange({ ...filters, search: '' })}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <Button
          variant={showFilters ? 'secondary' : 'outline'}
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="default" className="ml-1 h-5 w-5 p-0 justify-center">
              {(filters.stages.length > 0 ? 1 : 0) +
                (filters.dateRange.from || filters.dateRange.to ? 1 : 0) +
                (filters.valueRange.min !== undefined || filters.valueRange.max !== undefined ? 1 : 0)}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        )}

        {filteredCount !== totalCount && (
          <span className="text-sm text-muted-foreground">
            Showing {filteredCount} of {totalCount} leads
          </span>
        )}
      </div>

      {/* Extended Filters */}
      {showFilters && (
        <div className="p-4 bg-card rounded-lg border border-border space-y-4 animate-slide-in">
          {/* Stage Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Filter by Stage</label>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((stage) => (
                <Button
                  key={stage.id}
                  variant={filters.stages.includes(stage.id) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleStage(stage.id)}
                  className="gap-1.5"
                >
                  <div className={cn('w-2 h-2 rounded-full', stageColors[stage.id])} />
                  {stage.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Created Date Range</label>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'justify-start text-left font-normal',
                      !filters.dateRange.from && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateRange.from
                      ? format(filters.dateRange.from, 'MMM d, yyyy')
                      : 'From date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.from}
                    onSelect={(date) =>
                      onFiltersChange({
                        ...filters,
                        dateRange: { ...filters.dateRange, from: date },
                      })
                    }
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground">to</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'justify-start text-left font-normal',
                      !filters.dateRange.to && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateRange.to
                      ? format(filters.dateRange.to, 'MMM d, yyyy')
                      : 'To date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.to}
                    onSelect={(date) =>
                      onFiltersChange({
                        ...filters,
                        dateRange: { ...filters.dateRange, to: date },
                      })
                    }
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              {(filters.dateRange.from || filters.dateRange.to) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onFiltersChange({ ...filters, dateRange: {} })}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Value Range Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Deal Value Range</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min value"
                value={filters.valueRange.min ?? ''}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    valueRange: {
                      ...filters.valueRange,
                      min: e.target.value ? parseInt(e.target.value) : undefined,
                    },
                  })
                }
                className="w-32"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="number"
                placeholder="Max value"
                value={filters.valueRange.max ?? ''}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    valueRange: {
                      ...filters.valueRange,
                      max: e.target.value ? parseInt(e.target.value) : undefined,
                    },
                  })
                }
                className="w-32"
              />
              {(filters.valueRange.min !== undefined || filters.valueRange.max !== undefined) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onFiltersChange({ ...filters, valueRange: {} })}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
