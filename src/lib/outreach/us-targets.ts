// Where the US targets are searched (OUTREACH_PLAN.md §3): agencies and
// property managers share the Eastern and Central US states and cities.

// Searched one city at a time; Places returns at most 60 per search
export const US_TARGET_METROS: { state: string; name: string; cities: string[] }[] = [
  { state: 'NY', name: 'New York', cities: ['New York', 'Buffalo', 'Rochester', 'Albany'] },
  { state: 'FL', name: 'Florida', cities: ['Miami', 'Tampa', 'Orlando', 'Jacksonville'] },
  { state: 'TX', name: 'Texas', cities: ['Houston', 'Dallas', 'Austin', 'San Antonio'] },
  { state: 'IL', name: 'Illinois', cities: ['Chicago', 'Naperville'] },
  { state: 'GA', name: 'Georgia', cities: ['Atlanta', 'Savannah'] },
  { state: 'NC', name: 'North Carolina', cities: ['Charlotte', 'Raleigh'] },
  { state: 'SC', name: 'South Carolina', cities: ['Charleston', 'Columbia', 'Greenville'] },
]

// Small property managers and brokerages: inquiries, showings and
// maintenance calls, usually tracked in spreadsheets and inboxes. "Leasing
// office" is left out: it finds big apartment complexes.
export const PROPERTY_SEARCHES = [
  'property management company',
  'rental property management',
  'real estate brokerage',
  'realty',
]
