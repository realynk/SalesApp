# Realynk Sales & Growth Command Center

Internal workspace for the Realynk Assistants Sales & Growth Lead. SendPilot remains the outbound tool. This application starts when a lead becomes meaningful: it keeps a stage, a last activity, a next action, an owner, and a due date on every open opportunity, and it reconciles SendPilot exports so interested leads are not dropped.

## Stack

Next.js, TypeScript, Tailwind CSS, shadcn/ui, and Supabase (Postgres, Auth, Storage). The app is built for Vercel.

## Setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/migrations/20260923170000_command_center.sql`.
3. In Authentication, create the Sales & Growth Lead and disable public sign-ups. The migration adds a trigger that creates an internal profile for each new auth user. Role is stored on `profiles`, not in user-editable metadata.
4. Copy `.env.example` to `.env.local` and set:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

5. `npm install`
6. `npm run dev`
7. Sign in. From the command center, load the sample workspace or import a SendPilot CSV, XLS, or XLSX file.

On Vercel, set the same public environment variables and deploy. No service-role key is required for the app. Row level security allows signed-in internal users to read and write workspace data.

## SendPilot

There is no invented SendPilot API. File import is the sync path. If API credentials are present, the settings screen says so and the app still does not call undocumented endpoints. `POST /api/sendpilot/webhook` returns 501 until a real contract exists.

Import shows a confirmation count (new, existing, updated, possible duplicates, unmatched) before anything is written. Duplicates are matched on email, LinkedIn URL, and company plus contact name. Duplicate and unmatched rows are kept for review.

## What the workspace tracks

Leads and SendPilot status stay separate from the sales pipeline. Opportunities move forward or backward without deleting activity, stage history, notes, or candidate status history. Strategy calls, recruitment requests, candidates, profile sends, interviews, SOWs, client start, and revenue (potential MRR/ARR versus closed) are on the opportunity. Stale, waiting, and approaching thresholds are in Settings.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm test`
