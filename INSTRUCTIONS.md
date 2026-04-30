# ICT SalesLocker — User Guide

**Version:** May 2026  
**Platform:** https://ict-saleslocker.vercel.app  
**Support:** Contact your system administrator

---

## 1. What is SalesLocker?

SalesLocker is ICT Services' internal sales operations platform. It replaces spreadsheet reporting and provides a single, live view of pipeline, revenue, margin, and sales performance. All data comes from Autotask CRM — SalesLocker does not create or edit opportunities, it reads and reports on them.

---

## 2. Accessing the Platform

Go to the SalesLocker URL and sign in with your email and password. If you have not received an invite, contact your administrator.

**Roles and what you can see:**

| Role | Access |
|---|---|
| Admin | Everything — all data, settings, commission, upload |
| Sales Manager | Dashboard, pipeline, reports, weekly report, commission review, upload |
| Sales Rep | Dashboard, pipeline, reports, commission (own data only) |
| Read Only | Dashboard and pipeline views only |

If you can see the wrong things or cannot access a section, contact your administrator to check your role assignment in Supabase.

---

## 3. Loading Data

SalesLocker does not sync automatically — data must be uploaded from Autotask exports. This is a manual step that should be done before any meeting or reporting session.

### 3.1 Main Opportunities Export (used by all dashboards)

This is the primary data source for the entire platform.

**How to export from Autotask:**
1. In Autotask, go to **CRM → Opportunities → Search**
2. Set date range: **1 January 2026 → Today**
3. Leave all statuses selected (Active, Closed, Lost, Implemented, Not Ready)
4. Click **Export → CSV**
5. Save the file

**How to upload:**
1. In SalesLocker, click **Upload Data** in the sidebar
2. Drag and drop the CSV file onto the upload zone, or click to browse
3. Wait for the import summary — it will show how many records were inserted, updated, or skipped
4. All dashboard views will immediately reflect the new data

**When to upload:**
- Before the weekly sales meeting
- Before running commission calculations
- Any time you need the data to reflect recent closes or pipeline changes

**Important:** If an opportunity was deleted in Autotask, it will NOT be automatically removed from SalesLocker. See Section 7 (Troubleshooting) for how to handle this.

### 3.2 Meetings Export (used by Weekly Report only)

The Weekly Report requires a second export from Autotask's To-Do and Note module for the meetings sections.

**How to export from Autotask:**
1. In Autotask, go to **Search → To-Dos & Notes**
2. Set the date range to cover **both** last week and this week (e.g. Monday two weeks ago to Sunday this week)
3. Filter by **Action Type**: select Meeting and Account Management Meeting
4. Export to CSV

**How to load:**
1. Go to **Weekly Report** in the sidebar
2. Drop the CSV onto the upload zone at the top of the page, or click to browse
3. The meetings sections will populate automatically
4. This data is not stored — it resets when you leave the page, so re-load it each session

---

## 4. Dashboard — Overview

The main dashboard gives you a live snapshot of the business. It auto-populates from the last uploaded Autotask export.

**Key metrics (top row):**
- **Active Pipeline** — total value of all active opportunities (status = Active)
- **Won Revenue** — total value of all closed/won deals
- **Gross Profit (Won)** — GP on won deals with margin %
- **Win Rate** — won deals as a % of all closed deals (won + lost)

**Secondary metrics:**
- **Weighted Pipeline** — stage-probability adjusted pipeline value (Stage 1 = 5%, Stage 2 = 10%, Stage 3 = 50%, Stage 4 = 90%, Stage 5 = 100%)
- **Lost Revenue** — total value of lost deals
- **No Activity (14d+)** — active pipeline deals with no activity logged in 14+ days
- **Data Issues** — deals where cost data is missing (affects margin accuracy)

**Breakdowns:**
- **Pipeline by Category** — hardware, software, maintenance, services, etc.
- **Performance by Rep** — pipeline, won, GP margin %, and conversion rate per rep
- **Top Customers** — combined pipeline + won value per customer with stacked bars
- **No Activity Panel** — expandable list of stale deals with days since last activity
- **Overdue Panel** — active deals where the projected close date has passed

---

## 5. Pipeline

The Pipeline page shows all active and on-hold opportunities in a sortable, filterable table.

**Filters available:**
- Free text search (company name or opportunity name)
- Status (Pipeline / On Hold / Stale)
- Rep (Account Manager)
- Category

**Columns:** Company, Opportunity, Rep, Category, Status, Revenue, Margin %, Close Date, Flags

**Flags shown per deal:**
- ⚠ Overdue (projected close date passed 7+ days)
- €? Missing cost data
- ⏸ No activity 14+ days
- ● Hot/Warm/Cold rating (coloured dot)

Click any column header to sort. The totals row at the bottom shows aggregated revenue and margin for the filtered view.

---

## 6. Leadership Report

A more detailed view designed for leadership meetings, showing wins and pipeline by category, customer, and deal — with drill-down to individual deals.

**This report auto-loads from the live database.** No export needed beyond the standard Autotask upload.

**Features:**
- Period date filter (default: last 30 days, adjustable)
- KPI cards: Total Won, GP on Wins, Active Pipeline, Avg Deal Size, Win/Pipeline ratio
- Category comparison chart (wins vs pipeline)
- Top customers — wins and pipeline
- Top 10 won deals and top 10 open deals tables
- Risk indicators: overdue deals, long-running deals (60+ days), high-value deals closing in 21 days, concentration risks

**Expanding categories and customers:** Click any category or customer row in the wins/pipeline sections to expand and see individual deals.

**Print:** Use the Print button in the top right to print or save as PDF for distribution.

---

## 7. Weekly Report

Generates the five sections used in the weekly sales team meeting. Sections 1, 2, and 5 auto-populate from the database. Sections 3 and 4 require a meetings CSV upload (see Section 3.2).

**Sections:**
1. **Deals Closed Last Week** — won deals with closed date in Mon–Sun of last week. Shows a summary banner (count, revenue, GP, margin%) plus individual deals ≥€5k. Sub-threshold deals show as a summary line with GP%.
2. **Closing This Week** — active pipeline deals with projected close date in Mon–Sun this week. Same format as above.
3. **Customer Meetings Held** — meetings from last week. Requires CSV upload. Grouped by rep.
4. **Meetings Planned This Week** — meetings from this week. Requires same CSV upload.
5. **New Engagements** — opportunities created last week. Sorted by value, same highlight/summary format.

**Rep filter:** Use the filter buttons at the top to view one rep at a time. Drag the buttons to reorder them for the meeting. "All reps" shows everyone's data combined.

**Note:** The report only shows data for the configured sales team (Barbara Maciejska, John Conboy, James Dowdall, Evan O'Hora, John Roche, Jamie Taylor). Tom Desmond's cash automation deals and Portal/OGP framework entries are excluded.

---

## 8. Snapshots

Pipeline snapshots allow you to track what has changed between two meetings.

**Saving a snapshot:**
1. Go to **Snapshots** in the sidebar
2. Enter a name (e.g. "Leadership Meeting 22 Apr 2026")
3. Click **Save Snapshot** — this captures all 112 active pipeline deals at that moment

**Comparing snapshots:**
1. After a subsequent meeting, upload fresh Autotask data
2. Go to Snapshots and click **Compare to now** next to the saved snapshot
3. The comparison shows:
   - **Won** — was in pipeline, now closed
   - **Lost** — was in pipeline, now lost
   - **Advanced** — stage moved forward
   - **Regressed** — stage moved back or went On Hold
   - **Slipped** — close date pushed out by 14+ days
   - **New** — appeared since the snapshot
   - **No Change** — same stage and status

**Best practice:** Save a snapshot just before each leadership meeting so you have a clean baseline for the next one.

---

## 9. Commission (Admin/Manager only)

The commission module calculates earnings for each rep based on their commission structure type.

### 9.1 Commission Types

**Type 1 — Category Rates (3 reps)**  
Commission is based on burdened margin. Burden = 25% applied to (Revenue minus direct costs). Rate varies by deal category and whether the customer is new or existing.

**Type 2 — Threshold Margin (1 rep)**  
No burden applied. If quarterly gross profit exceeds the configured threshold, 10% commission is paid on everything above the threshold. Threshold is set per rep.

**Type 3 — Annual Target Bonus (2 reps)**  
Annual margin target with quarterly bonus payout. Rollover applies between quarters. Accelerators (20% and 25%) apply at year end on margin above €450k and €950k respectively.

### 9.2 Commission Settings (Admin only)

Go to **Commission → Commission Settings**.

**Category Mappings tab:** Control how each Autotask opportunity category maps to a commission category (Hardware, Maintenance, Support Services, or Exclude). Changes take effect on the next calculation run.

**Type 1 Rates tab:** View and edit the commission rates per business type and category. Click any rate to edit inline.

**Rep Configuration tab:** Add reps, set their commission type, and configure type-specific parameters (threshold, targets, rates, rollover).

**Account Splits tab:** Configure company-level commission splits for shared accounts (e.g. RenaissanceRe 50/50 between two reps). Deal-level splits can be set in the Commission Review breakdown.

### 9.3 Running Commission Calculations

Go to **Commission → Commission Review**.

1. Select the year and quarter
2. Click **Preview** first to see the calculated figures without saving
3. Review the preview — check deal counts and payable amounts
4. Click **Calculate & Save** to store the results
5. Click on any rep row to expand the deal-level breakdown
6. In the breakdown, click the **Business Type** badge on any deal to override new/existing classification
7. After overriding classifications, re-run Calculate & Save to recalculate
8. Click **Export CSV for Finance** to download the deal-level workings
9. Once finance has reviewed, click **Approve** on each rep's calculation
10. After payment, click **Mark Paid**

**Important notes:**
- All deals default to "Existing Client" classification. New client deals must be manually flagged in the deal breakdown.
- Commission calculations are based on opportunities with `normalised_status = won` and a closed date within the quarter.
- Approved or paid calculations cannot be overwritten — only draft calculations can be recalculated.
- Every approval and payment is logged in the audit trail.

### 9.4 My Commission (Sales Rep view)

Reps with the `sales_rep` role see only their own commission data. This shows:
- Paid, approved, and pending quarterly totals
- Their commission structure explained
- Deal-by-deal breakdown per quarter (expand each row)

---

## 10. User Management (Admin only)

Users are managed in the Supabase dashboard, not in SalesLocker directly.

**To invite a new user:**
1. Go to your Supabase project → **Authentication → Users → Invite user**
2. Enter their email address and click Send
3. They will receive a link to set their password
4. Once they have logged in, go to **Table Editor → profiles**
5. Find their row and set:
   - `role` — one of: `admin`, `sales_manager`, `sales_rep`, `read_only`
   - `autotask_name` — their name exactly as it appears in Autotask (e.g. `Taylor, Jamie`)
6. Click away from the cell to save

**Roles summary:**
- `admin` — full access including commission settings and user management
- `sales_manager` — full access except commission settings
- `sales_rep` — read-only dashboard and their own commission summary
- `read_only` — dashboard and pipeline views only

The `autotask_name` field is critical — it links the user's login to their deals in Autotask. It must match exactly, including the comma format (Surname, Firstname).

---

## 11. Troubleshooting

**Deal was deleted in Autotask but still shows in SalesLocker**  
The import process only adds/updates records — it does not remove deleted ones. To remove it manually:
1. Go to Supabase → SQL Editor
2. Run: `SELECT * FROM opportunities WHERE opportunity_name = 'Deal Name Here';`
3. Confirm only the right row is returned
4. Run: `DELETE FROM opportunities WHERE opportunity_name = 'Deal Name Here';`

**Commission showing wrong business type (all appearing as "Existing")**  
This is expected — the system defaults to Existing Client because we don't have pre-2026 historical data to auto-detect new vs existing. To mark a deal as New Client:
1. Go to Commission Review → run a calculation for the quarter
2. Expand the rep's deal breakdown
3. Click the "Existing" badge on any deal to change it to "New Client"
4. Re-run Calculate & Save to recalculate with the updated classification

**Upload shows deals that should be excluded**  
Check if the opportunity's `Account Manager` in Autotask is set to `Portal, OGP` — these are automatically separated into the portal bucket and excluded from most views. If a deal is incorrectly categorised, the fix is in Autotask (change the Account Manager field), then re-upload.

**Dashboard figures don't update after upload**  
The dashboard fetches fresh data on every page load. Try a hard refresh (Ctrl+Shift+R). If the import summary showed errors, check the error details on the Upload page.

**I can't see a section in the sidebar**  
Your role may not have access to it. Contact your administrator to verify your role is set correctly in Supabase.

---

## 12. Autotask Export Reference

| What you need | Where to export in Autotask | Used by |
|---|---|---|
| Opportunities (all) | CRM → Opportunities → Search → Export CSV | All dashboards |
| Meetings & To-Dos | Search → To-Dos & Notes → Export CSV | Weekly Report |

**Recommended export settings for Opportunities:**
- Date range: 1 January 2026 → Today
- All statuses
- All owners

**Recommended export settings for Meetings:**
- Date range: Cover both last week and this week in one export
- Action Type: Meeting, Account Management Meeting

---

*This guide covers SalesLocker as of May 2026. For questions or issues, contact John Roche.*
