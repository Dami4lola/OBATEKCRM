import type { TemplateStep } from './settings'

// The default email wording and sender, kept apart from the other settings
// so the public demo can swap this one file (demo/build.mjs).
// Mirrors 009_write_step.sql, 012_car_dealer_template.sql, 015_agencies.sql and 018_property.sql; edit there (or in the settings table)
export const DEFAULT_EMAIL_TEMPLATES: Record<string, TemplateStep[]> = {
  default: [
    {
      step: 1,
      subject: '{{subject}}',
      body: "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK here in Ottawa. We set up simple tools for trades businesses: online quotes and booking, job tracking, and an AI receptionist that picks up when you're on a job.\n\nWould a free one-page audit of how {{company}} handles calls and quotes be useful?\n\n{{sender_name}}",
    },
    {
      step: 2,
      subject: 're: {{subject}}',
      body: 'Hi {{first_name}},\n\nFollowing up in case my last note got buried. If missed calls or slow quotes ever cost {{company}} a job, the free audit would show where. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}',
    },
    {
      step: 3,
      subject: 're: {{subject}}',
      body: 'Hi {{first_name}},\n\nI\'ll leave it here. If it\'s ever useful, reply "audit" and I\'ll put it together for {{company}}.\n\n{{sender_first_name}}',
    },
  ],
  car_dealer: [
    {
      step: 1,
      subject: '{{subject}}',
      body: "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK here in Ottawa. We help dealerships let buyers book test drives online, follow up on every enquiry, and answer calls with an AI receptionist when the team is busy or the lot is closed.\n\nWould a free one-page audit of how {{company}} handles calls and buyer enquiries be useful?\n\n{{sender_name}}",
    },
    {
      step: 2,
      subject: 're: {{subject}}',
      body: "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If a missed call or a slow reply to a test-drive request ever cost {{company}} a sale, the free audit would show where. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}",
    },
    {
      step: 3,
      subject: 're: {{subject}}',
      body: "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}",
    },
  ],
  agency: [
    {
      step: 1,
      subject: '{{subject}}',
      body: "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK, a small automation shop. We set up the back office for agencies like {{company}}: instant follow-up on every new inquiry, an AI receptionist for your sales line during client calls, and discovery calls booked straight onto your calendar.\n\nWould a free one-page audit of how {{company}} handles new inquiries be useful?\n\n{{sender_name}}",
    },
    {
      step: 2,
      subject: 're: {{subject}}',
      body: "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If a good lead ever went cold while the team was heads-down on client work, the free audit would show where {{company}}'s inquiries slip. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}",
    },
    {
      step: 3,
      subject: 're: {{subject}}',
      body: "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}",
    },
  ],
  property: [
    {
      step: 1,
      subject: '{{subject}}',
      body: "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK, a small automation shop. For property managers and brokerages like {{company}}, we set up a CRM that keeps every lead, tenant and owner in one place, instant replies to inquiries, and an AI receptionist for after-hours calls.\n\nWould a free one-page audit of how {{company}} handles calls and inquiries be useful?\n\n{{sender_name}}",
    },
    {
      step: 2,
      subject: 're: {{subject}}',
      body: "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If an inquiry or a maintenance call ever slipped through while the team was out at a showing, the free audit would show where {{company}} loses them. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}",
    },
    {
      step: 3,
      subject: 're: {{subject}}',
      body: "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}",
    },
  ],
}

export const DEFAULT_SENDER_NAME = 'Dami Ayoade'
