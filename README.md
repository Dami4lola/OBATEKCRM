# Obatek CRM

A GoHighLevel-style CRM built with Next.js 15, TanStack Query, and Supabase.

## Features

- **Kanban Pipeline**: Drag-and-drop leads between stages
- **Contacts Table**: View all leads with filtering and sorting
- **Lead Management**: Add, edit, and delete leads
- **Authentication**: Sign up and sign in with Supabase Auth
- **Shared Workspace**: All authenticated users can see and edit all data

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- shadcn/ui + Tailwind CSS
- TanStack Query (React Query)
- TanStack Table
- @hello-pangea/dnd (drag-and-drop)
- React Hook Form + Zod
- Supabase (PostgreSQL + Auth)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Run the SQL setup

See the full SQL in the plan file or run it in Supabase SQL Editor.

### 4. Disable email confirmation (optional)

In Supabase Dashboard → Authentication → Providers → Email → Disable "Confirm email"

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
