# ICT SalesLocker — Full Project Summary

## What It Is

SalesLocker is a full-stack sales operations platform built for ICT Services (Ireland) to replace Excel-based reporting. It ingests Autotask CRM data via CSV upload, stores it in Supabase (PostgreSQL), and presents dashboards, reports, and commission calculations through a Next.js web application deployed on Vercel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5.15 (App Router) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password; Microsoft SSO planned) |
| Hosting | Vercel |
| Styling | Tailwind CSS (custom brand colours: `brand: #D4145A`, `navy: #1A3A5C`) |
| Language | TypeScript (strict) |
| CSV parsing | PapaParse |

**Repository location:** `C:\Users\RocheJ\OneDrive - TOTAL ICT SERVICES LTD\Documents\Claude\Projects\ICT\saleslocker`

---

## Roles & Access Control

Four roles enforced at both middleware and page level:

- **admin** — full access to everything
- **sales_manager** — access to all reporting, targets, weekly report, commission review; no commission settings
- **sales_rep** — access to own commission view only (`/dashboard/commission/mine`)
- **read_only** — overview and pipeline only

Role is stored in `profiles.role` in Supabase. Sidebar nav items filter by `allowedRoles`.

---

## Sales Team Configuration

Defined in `src/lib/config.ts` — **single source of truth**. Update here when team changes.

```typescript
export const SALES_TEAM = [
  { key: 'Maciejska, Barbara', first: 'Barbara', display: 'Barbara Maciejska' },
  { key: 'Conboy, John',       first: 'John C',  display: 'John Conboy'       },
  { key: 'Dowdall, James',     first: 'James D', display: 'James Dowdall'     },
  { key: "O'Hora, Evan",       first: 'Evan',    display: "Evan O'Hora"       },
  { key: 'Roche, John',        first: 'JR',      display: 'John Roche'        },
  { key: 'Taylor, Jamie',      first: 'Jamie',   display: 'Jamie Taylor'      },
]
```

`key` must exactly match the Autotask `Account Manager` or `Opportunity Owner` field value.

The file also exports: `SALES_TEAM_KEYS`, `isSalesTeamDeal()`, `repDisplayName()`, `quarterBounds()`, `currentQuarter()`, `weekBounds()`.

---

## Database Migrations (in order)

All files in `supabase/migrations/`. Must be applied in sequence in the Supabase SQL editor.

### 001_schema.sql
Core tables:
- **`opportunities`** — main data table. All Autotask opportunity data. Key fields: `composite_key` (unique, used for upsert), `normalised_status` (pipeline/won/lost/on_hold/on_hold_stale/portal), `account_manager`, `opportunity_owner`, `revenue_total`, `gross_profit`, `gross_margin_pct`, `closed_date`, `projected_close_date`
- **`stage_weights`** — pipeline stage → weight % for weighted forecasting (L=0%, S1=5%, S2=10%, S3=50%, S4=90%, S5=100%)
- **`import_logs`** — records each CSV upload (filename, row counts, timestamp, errors)
- **`profiles`** — one row per auth user, stores `role`, `display_name`
- RLS policies for all tables
- `handle_new_user` trigger — creates profile row on signup

### 002_snapshots.sql
- **`pipeline_snapshots`** — point-in-time snapshot of pipeline state (triggered manually from UI)
- **`snapshot_deals`** — deal-level detail within each snapshot
- Used by the Snapshots page to show pipeline movement between two dates

### 003_commission.sql
Commission calculation infrastructure:
- **`commission_rep_configs`** — per-rep commission type and parameters (see Commission section)
- **`commission_category_mappings`** — Autotask category → commission category (hardware/maintenance/support_services/exclude)
- **`commission_type1_rates`** — rate % per `business_type × commission_category` combination
- **`commission_deal_classifications`** — manual overrides: new_client / existing_client / renewal per deal
- **`commission_calculations`** — quarterly calculation results per rep (status: draft/approved/paid)
- **`commission_deal_lines`** — deal-level workings for each calculation

### 004_splits.sql
- **`commission_company_splits`** — company-level split rules (rep1/rep2 + percentages)
- **`commission_deal_splits`** — deal-level split overrides (by composite_key)

### 005_pulse.sql
- **`sales_pulse_reports`** — saved weekly CEO narrative reports (unique on `week_start`)
  - Fields: `week_label`, `week_start`, `week_end`, `meeting_notes`, `pipeline_narrative`, `target_narrative`, `support_notes`, `data_snapshot`, `status` (draft/published), `created_by`

### 006_targets.sql
- **`company_targets`** — quarterly revenue + margin target per year/quarter
- **`rep_targets`** — quarterly personal + team pool margin target per rep per year/quarter

### 007_views.sql
Shared aggregation views (avoids duplicated SQL across APIs):
- **`v_rep_quarterly_actuals`** — won revenue + GP per rep per quarter. Attribution: account_manager primary, opportunity_owner fallback. Excludes Portal/OGP.
- **`v_company_quarterly_actuals`** — company-level totals per quarter
- **`v_rep_target_attainment`** — joins rep actuals with rep targets; computes `personal_attainment_pct`

### 008_category_targets.sql
GL code / product line targets:
- **`category_revenue_targets`** — annual revenue target per GL category per year. Seeded with 2026 data (see below). Quarterly target = annual ÷ 4.
- **`autotask_gl_map`** — maps Autotask `category` field → GL category name. Seeded with 28 known mappings from actual Autotask category names.
- **`v_category_quarterly_actuals`** — sums won deal revenue by GL category per quarter via the mapping table

#### 2026 Category Targets (seeded)

| Category | GL Code | Annual Target |
|---|---|---|
| Hardware Sales | 4006 | €5,585,000 |
| Dedicated Resources | 4003 | €3,484,097 |
| Dispatch Services | 4005 | €1,526,875 |
| Strategic Sales | — | €1,237,000 |
| Annual Maintenance | 4001 | €798,683 |
| MSP | 4016 | €735,114 |
| Deployment & Projects | 4004 | €670,000 |
| Reseller Warranty | 4014 | €214,327 |
| Customer Rebate | — | €120,500 |
| Storage & Logistics | — | €108,780 |
| Software Sales | — | €36,000 |
| Reseller Services / General | 4015 | €25,200 |
| **Grand Total** | | **€14,561,576** |
| OGP (Lot 1) *(framework)* | — | €5,900,000 |
| OGP (Lot 2) *(framework)* | — | €1,800,000 |
| Garda *(framework)* | — | €5,000,000 |
| DOJ *(framework)* | — | €1,500,000 |

OGP actuals are queried via `account_manager = 'Portal, OGP'` and split proportionally (76% Lot1 / 24% Lot2). DOJ actuals come through `autotask_gl_map` via the 'DOJ Tender Sales' Autotask category. Garda actuals require a dedicated Autotask category mapping to be added.

---

## Implemented Features

### 1. CSV Data Import (`/dashboard/upload`)
- Drag-and-drop or browse for Autotask CSV export
- Full PapaParse ingest engine (`src/lib/csv/parser.ts`)
- Upserts on `composite_key` (Company | OpportunityName | CreateDate)
- Normalises `status` + `stage` into `normalised_status`
- Sets data quality flags: `cost_missing`, `is_negative_margin`, `is_overdue`
- Excludes test rows, deduplicates, logs every import
- Visible to admin and sales_manager only

### 2. Overview Dashboard (`/dashboard`)
- Metric cards: pipeline value, weighted pipeline, won revenue, win rate, deal count
- Pipeline table with stage grouping, value and GP breakdown
- Category breakdown chart
- Customer breakdown (top accounts by pipeline value)
- Owner breakdown (pipeline per rep)
- Risk panel: overdue deals, stale activity
- Rep conversion rates

### 3. Pipeline View (`/dashboard/pipeline`)
- Full opportunity table with filtering by stage/rep/category
- Sort by any column
- GP% and margin displayed per deal

### 4. Leadership Report (`/dashboard/leadership`)
- Full-screen rich dashboard at `/dashboard/leadership`
- Loads live data from Supabase server-side (wins + active pipeline)
- Falls back to CSV drag-and-drop if live data not available
- Sections: KPI cards, **2026 Revenue Targets by Category** (new), wins by category with accordion drill-down, pipeline by category, cross-category compare chart (Chart.js), top customers, top 10 deals, risk flags
- Date range filter in header
- Print button

### 5. Weekly Sales Report (`/dashboard/weekly`)
- Visible to admin and sales_manager
- Three sections: deals closed last week, deals due to close this week, new engagements created last week
- Draggable rep filter buttons (reorder to match meeting order)
- Summary banner per section (count, revenue, GP, avg margin)
- Below-threshold rollup (deals under €5k shown as aggregate)
- CSV drag-and-drop for meeting/activity data (Autotask To-Do & Note Search export)
- Meetings section (last week and this week)

### 6. Sales Pulse — CEO Report (`/dashboard/pulse`)
- Visible to admin only
- Generates AI-drafted weekly narrative with four sections:
  - **Meeting Notes** — which day the meeting took place
  - **Pipeline Narrative** — per-rep summary of closures and upcoming pipeline
  - **Target Narrative** — team GP attainment vs quarterly target, per-rep breakdown, top/bottom category highlights, notable closures
  - **Net New Engagements** — per-rep count with named examples
- Editable before saving (all four text areas)
- Save to `sales_pulse_reports` with draft/published status
- View saved archive of previous weeks
- Target narrative is data-driven via `v_rep_target_attainment` and `v_category_quarterly_actuals`

### 7. Targets (`/dashboard/targets`)
- Visible to admin and sales_manager
- Quarter/year selector
- **Company target card** — revenue and GP progress bars vs quarterly target (CRM actuals only)
- **Rep targets card** — per-rep personal margin target with RAG progress bar; optional team pool target
- **Revenue by Category card** — 12 product lines + 4 framework accounts, each showing quarterly target (annual ÷ 4), CRM actual, RAG progress bar, attainment %
- Note on OGP Lot1/2 proportional split and Garda mapping requirement

#### Targets Settings (`/dashboard/targets/settings`)
- Set company-level revenue and margin targets per quarter
- Set individual rep margin targets (personal + team pool) per quarter

### 8. Snapshots (`/dashboard/snapshots`)
- Take named point-in-time pipeline snapshot
- Compare any two snapshots side by side
- Shows: new deals, closed deals, stage movements, value changes

### 9. Commission (`/dashboard/commission`)
- Visible to admin and sales_manager; sales_rep routed to `/mine`

#### Three Commission Types

**Type 1 — Category Rates + Burden**
- Revenue → subtract direct cost → subtract burden cost (configurable %) → burdened margin
- Apply rate % based on `business_type × commission_category` matrix
- Rate table is configurable in settings

**Type 2 — Threshold Margin**
- Sum all GP for the quarter
- Commission = (GP above threshold) × rate %
- Threshold and rate configurable per rep

**Type 3 — Annual Target Bonus**
- Track YTD cumulative GP against annual target
- Each quarter: if YTD ≥ YTD target → earn quarterly bonus (annual bonus ÷ 4)
- No commission percentage, pure bonus model

#### Split Rules
- **Company-level splits** — all deals from a company shared between two reps (configurable %)
- **Deal-level splits** — override for individual deals by composite_key

#### Commission Review (`/dashboard/commission/review`)
- Run quarterly calculation: Preview or Calculate & Save
- View all saved calculations filtered by quarter
- Expand each calc to see full deal-level breakdown table
- Override business type (New Client / Existing / Renewal) inline — click badge to edit, re-run to recalculate
- Status workflow: draft → Approve → paid
- Export to CSV for finance (includes all workings)

#### Commission Settings (`/dashboard/commission/settings`) — Admin only
- Category mappings: Autotask category → commission category
- Type 1 rates matrix: editable inline
- Per-rep configs: commission type, burden rate, threshold, annual target, splits

#### My Commission (`/dashboard/commission/mine`) — Sales rep view
- Shows approved/paid/pending totals
- Commission structure explanation (based on their type)
- Quarterly history with deal breakdown per quarter

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/import` | POST | CSV ingest and upsert |
| `/api/weekly` | GET | Weekly report data |
| `/api/pulse` | GET | Generate/list/get pulse reports |
| `/api/pulse` | POST | Save/update pulse report |
| `/api/targets` | GET | Targets + actuals (rep, company, category) |
| `/api/targets` | POST | Upsert company or rep target |
| `/api/snapshot` | GET/POST | Create/list snapshots |
| `/api/snapshot/compare` | GET | Compare two snapshots |
| `/api/commission/calculate` | POST | Run quarterly commission calculation |
| `/api/commission/classify` | PATCH | Override deal business type |
| `/api/commission/deal-lines` | GET | Deal lines for a calculation |
| `/api/commission/status` | PATCH | Update calculation status |
| `/api/commission/settings/categories` | GET/POST | Category mappings |
| `/api/commission/settings/rates` | GET/POST | Type 1 rate table |
| `/api/commission/settings/reps` | GET/POST | Rep configs |
| `/api/commission/splits` | GET/POST | Company splits |
| `/api/commission/splits/deal` | GET/POST | Deal-level splits |

---

## Key Architectural Decisions

- **`composite_key`** for upsert: `Company|OpportunityName|CreateDate` — avoids duplicates across CSV uploads
- **`normalised_status`** derived on import: maps Autotask status/stage combinations into clean enum. Portal/OGP deals → `portal`
- **Admin Supabase client** (service role) used for all write operations and cross-user reads; bypasses RLS where needed
- **Shared views** (`007_views.sql`) centralise aggregation logic used across multiple APIs
- **`src/lib/config.ts`** is the single source of truth for team membership — referenced by weekly, pulse, commission APIs

---

## Known Gotchas

- **Encoding corruption** — the Edit/Write tools sometimes append null bytes to files. Fix: `tr -d '\0' < file > clean && cp clean file`
- **Linter truncation** — a local linter/formatter sometimes truncates files at line 97 or similar. Fix: append the missing closing brace/tag manually
- **Git locks** — sandbox push attempts leave `.git/index.lock` and `.git/HEAD.lock`. Fix from terminal: `del .git\index.lock` then retry
- **`v_rep_quarterly_actuals` column names** — columns are `actual_revenue` and `actual_gp` (not `won_revenue`/`won_gp`)
- **Portal/OGP deals** — `account_manager = 'Portal, OGP'` is excluded from sales team reporting but included separately for framework target tracking
- **Autotask category names** — the `autotask_gl_map` is seeded with 28 known mappings based on the leadership report CAT_MAP. Run `SELECT DISTINCT category FROM opportunities ORDER BY 1` to verify all category names are mapped

---

## Pending / Planned Work

### Immediate — Next Session

**1. Category targets UI (settings page)**
Add a third section to `/dashboard/targets/settings` letting admin enter/edit annual revenue targets per GL category per year. The `category_revenue_targets` table and API are already built — just needs a UI. Flow: pick year → see all 16 rows → edit `annual_revenue_target` → save. API needs a `type: 'category'` case added to the POST handler.

**2. Commission configuration**
Before the first calculation can be run, Commission Settings needs to be populated:
- `commission_rep_configs` — each rep's commission type and parameters
- `commission_category_mappings` — Autotask categories → hardware/maintenance/support_services/exclude
- `commission_type1_rates` — rate matrix (new/existing/renewal × category)
Need to confirm commission structure for each of the 6 reps.

**3. Sales rep sidebar access**
Currently Commission is only visible to admin/sales_manager. Once calculations are run and approved, add `sales_rep` to the sidebar `allowedRoles` so reps can see `/commission/mine`.

### Phase 4 — Autotask API Sync

Replace the manual CSV upload workflow with a scheduled background job:
- Connect to Autotask REST API with service account credentials
- Run on a schedule (daily or triggered) via Vercel Cron or Supabase Edge Functions
- Replaces `/dashboard/upload` for day-to-day operation
- Upload page can remain as a manual override/backfill tool

### Phase 4 — Kaseya Quote Manager Integration

Enrich pipeline opportunities with quote data from Kaseya Quote Manager:
- Match quotes to opportunities via company/reference
- Surface cost breakdowns that Autotask doesn't carry

### Other Planned Features

- **Monthly CEO report archive** — view and compare saved pulse reports month-over-month; useful for board packs
- **Microsoft SSO** — replace email/password auth with Azure AD SSO
- **Commission history for reps** — extend `/commission/mine` with trend charts

---

## Deployment

- **Platform:** Vercel (connected to GitHub main branch)
- **Environment variables required:**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Supabase project:** Fresh project, all migrations applied in order 001–008
- **Custom domain:** Not yet configured

---

## Starting a New Chat

To continue development, paste this summary into the new chat along with the specific task. Key context to include:
- The repo path above
- Which migration files have been applied in Supabase
- The current commission structure for each rep (needed for Phase 3 setup)
- Any specific errors or behaviour observed in the deployed app
