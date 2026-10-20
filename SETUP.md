# ICT SalesLocker — Setup Guide

## Prerequisites
- Node.js 18+
- A Supabase account (supabase.com — free tier is fine)
- A Vercel account (vercel.com — free tier is fine)
- A GitHub account and repo for the code

---

## Step 1 — Create your Supabase project

1. Log in at supabase.com → New Project
2. Give it a name: `ict-saleslocker`
3. Set a strong database password (save it somewhere)
4. Choose region: Europe (West) — Ireland
5. Wait ~2 minutes for the project to spin up

---

## Step 2 — Run the database schema

1. In your Supabase project, go to **SQL Editor**
2. Click **New query**
3. Open the file `supabase/migrations/001_schema.sql` from this project
4. Paste the entire contents into the SQL editor
5. Click **Run** — you should see "Success. No rows returned"
6. Verify in **Table Editor** that you can see: `opportunities`, `profiles`, `import_logs`, `stage_weights`
7. Run the rest of `supabase/migrations/` in numeric order (002 onwards). `017_data_api_grants.sql` must be included, otherwise the API returns "permission denied" on a fresh project.

> **Grant rule for new migrations:** from 30 Oct 2026 Supabase no longer auto-grants API access on new tables in `public`. Every `CREATE TABLE` or `CREATE VIEW` must be followed by its own `GRANT` statements in the same migration. Use `authenticated` + `service_role` for normal tables, `service_role` only for token or credential tables. See `017_data_api_grants.sql` for the pattern.

---

## Step 3 — Get your API keys

1. In Supabase, go to **Project Settings → API**
2. Copy:
   - **Project URL** (e.g. `https://abcdefgh.supabase.co`)
   - **anon / public key** (safe for the browser)
   - **service_role key** (secret — never expose this publicly)

---

## Step 4 — Set up environment variables locally

1. Copy `.env.local.example` to `.env.local`
2. Fill in your three values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## Step 5 — Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## Step 6 — Create your first user

1. In Supabase, go to **Authentication → Users → Invite user**
2. Enter your email address
3. You'll receive a link — follow it to set your password
4. You'll be logged in but with `read_only` role

**Upgrade to admin:**
1. In Supabase, go to **Table Editor → profiles**
2. Find your row
3. Edit `role` → set to `admin`
4. Also set `autotask_name` to how your name appears in Autotask (e.g. `Roche, John`)

Repeat for each team member, setting their appropriate role:
- `admin` — full access, can upload data
- `sales_manager` — can upload data, see all reps
- `sales_rep` — read-only view of data
- `read_only` — leadership / restricted view

---

## Step 7 — Deploy to Vercel

1. Push this project to your GitHub repo
2. Log in to vercel.com → New Project → Import your repo
3. Framework: **Next.js** (auto-detected)
4. Add environment variables (same three as `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Click Deploy — typically takes 2-3 minutes
6. Your URL will be something like `https://ict-saleslocker.vercel.app`

---

## Step 8 — Import your first data

1. Log in to the deployed app
2. Go to **Upload Data** in the sidebar
3. Export from Autotask: CRM → Opportunities → Search → all statuses → Export CSV
4. Drag and drop the CSV file
5. Review the import summary

---

## Step 9 — Microsoft SSO (when ready)

When IT provides the Azure App Registration details:

1. In Supabase: **Authentication → Providers → Azure**
2. Enable it, paste in **Client ID** and **Client Secret** from IT
3. Copy the **Callback URL** shown and give it to IT to add to the App Registration
4. In `src/app/login/page.tsx`, a "Sign in with Microsoft" button can be added with one call:
   ```ts
   supabase.auth.signInWithOAuth({ provider: 'azure' })
   ```
5. Both email/password and Microsoft SSO can run simultaneously during transition

---

## Project structure

```
saleslocker/
├── supabase/migrations/     # SQL schema — run once in Supabase
├── src/
│   ├── app/
│   │   ├── login/           # Login page
│   │   ├── auth/callback/   # OAuth callback handler
│   │   ├── dashboard/       # Main dashboard, Pipeline, Upload
│   │   └── api/import/      # CSV import API endpoint
│   ├── components/dashboard/ # UI components
│   ├── lib/
│   │   ├── supabase/        # Browser + server clients
│   │   ├── csv/parser.ts    # Autotask CSV ingest engine
│   │   └── utils/           # Formatting helpers
│   └── types/index.ts       # All TypeScript types
└── SETUP.md                 # This file
```
