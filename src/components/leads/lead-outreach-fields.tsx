'use client'

import { useWatch, type Control } from 'react-hook-form'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EMAIL_SOURCES,
  VERTICALS,
  type LeadFormData,
} from '@/lib/validations/lead'

interface LeadOutreachFieldsProps {
  control: Control<LeadFormData>
}

// Fields the outreach engine uses: site audit, CASL check and copywriting
export function LeadOutreachFields({ control }: LeadOutreachFieldsProps) {
  const caslConfirmed = useWatch({ control, name: 'casl_confirmed' })

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-sm font-medium">Outreach details</h4>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="job_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Job Title</FormLabel>
              <FormControl>
                <Input placeholder="Owner" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="vertical"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vertical</FormLabel>
              <FormControl>
                <Input placeholder="hvac" list="lead-verticals" {...field} />
              </FormControl>
              <datalist id="lead-verticals">
                {VERTICALS.map((vertical) => (
                  <option key={vertical} value={vertical} />
                ))}
              </datalist>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input placeholder="acmehvac.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="linkedin_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>LinkedIn URL</FormLabel>
              <FormControl>
                <Input placeholder="https://linkedin.com/in/..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl>
                <Input placeholder="Ottawa" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="region"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Province/State</FormLabel>
              <FormControl>
                <Input placeholder="ON" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <FormControl>
                <Input placeholder="CA" maxLength={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="staff_size"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Staff Size</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="10"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    field.onChange(val === '' ? null : Number(val))
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="email_source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Source</FormLabel>
              <Select
                value={field.value ?? ''}
                onValueChange={(val) => field.onChange(val || null)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Where's the email from?" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EMAIL_SOURCES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="casl_confirmed"
        render={({ field }) => (
          <FormItem className="flex items-start gap-2 space-y-0">
            <FormControl>
              <Checkbox
                className="mt-0.5"
                checked={field.value ?? false}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            </FormControl>
            <div className="space-y-1">
              <FormLabel className="font-normal">CASL basis confirmed</FormLabel>
              <FormDescription>
                Tick when you know the business published this address or agreed to be contacted.
                Passes the CASL check without a site check.
              </FormDescription>
            </div>
          </FormItem>
        )}
      />

      {caslConfirmed && (
        <FormField
          control={control}
          name="casl_note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CASL note</FormLabel>
              <FormControl>
                <Input placeholder="Where it was published, or who agreed" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  )
}
