# ICT SalesIQ — Product Roadmap
*Last updated: June 2026*

---

## Vision

ICT SalesIQ is the sales operations command centre for Total ICT Services. The goal is simple: John opens it every morning alongside Outlook and has everything he needs to run the day — deals to act on, what changed overnight, pipeline health, team performance, and financial position — without hunting across Autotask, spreadsheets, or email.

This roadmap is structured in phases. Each phase stands on its own and delivers real value before the next begins. Personal dashboard is the anchor — everything else feeds into it.

---

## What's Already Built (Phase 1 — Complete)

The foundation is in place:

- CSV ingestion pipeline with normalisation and deduplication
- Core opportunity data model (status, margin, category, owner, dates, financials)
- Leadership report with wins and pipeline by category
- Retail leadership view
- Pipeline table with filtering
- Weekly report
- Targets admin (schema ready, UI scaffolded)
- Commission page (schema ready, logic pending)
- Snapshots
- Upload / CSV override
- Autotask API sync (scaffolded — probe, status, sync routes built)
- Personal dashboard (`/dashboard/john`) with Sales, Team, Ops, Financial, Marketing tabs
- Dell MDF marketing dashboard embedded

---

## Phase 2 — Personal Dashboard as Morning Command Centre
**Priority: Immediate. This is the daily driver.**

The personal dashboard exists but needs to become genuinely useful from the moment you log in. Everything in this phase requires no new integrations — it runs on data already in the database.

### 2a — Morning Brief (top of the personal dashboard)

A "what happened since yesterday" strip at the top of `/dashboard/john`. Loads on login, shows:

- New wins since yesterday
- New pipeline opps added
- Deals that went overdue overnight
- Deals with cost data missing (data hygiene alert)
- Any deals that moved status

This should feel like a 30-second scan, not a report. Cards with counts and quick links, not tables.

### 2b — Daily Action List

A prioritised list of deals that need attention *today*. Not a full pipeline view — a short, opinionated list. Scored by:

- Overdue (past projected close date) — highest priority
- No activity / no close date set — needs chasing
- Missing cost data — affects margin reporting
- On hold > 60 days — stale, needs a decision
- Large deals (> €X revenue) with no projected close — risk

Surfaced as a numbered action list with one-line context per deal. The aim is that John can action 3–5 things before 9:30am.

### 2c — Deal Timeline View

A quarter-view calendar axis showing pipeline deals by projected close date. Grouped by month, coloured by category or status. Answers "what's expected to close this quarter and when?" without reading a table. This goes on the Sales tab.

### 2d — Win/Loss Analysis Panel

Built entirely from existing data. Shows:

- Win rate over time (monthly/quarterly trend)
- Win rate by category — where are we strong, where are we losing?
- Win rate by deal size band (< €10k, €10–50k, €50–100k, > €100k)
- Average deal size: won vs. lost comparison
- Lost deal analysis — what categories / deal sizes slip most often?

Goes on the Sales tab as a collapsible "Analysis" section.

### 2e — Margin Trend View

Time-series of average gross margin % per quarter, broken down by category. Answers whether pricing discipline is holding over time. Simple line chart, existing data only. Goes on the Financial tab.

### 2f — Rep Scorecard

A team performance table on the Team tab (admin/manager only). For each rep (by opportunity_owner):

- Total won revenue (YTD)
- Win rate
- Average deal size
- Average margin %
- Pipeline coverage (pipeline value ÷ target, once targets are set)
- Deals overdue count

No new data needed — all derivable from the opportunities table.

---

## Phase 3 — Targets, Forecasting & Financial Intelligence
**Unlocks the management layer. Transforms reporting into decision support.**

### 3a — Targets vs. Actuals

Complete the targets configuration started in Phase 1. Once category targets are set:

- Every dashboard view gets a RAG status (Red / Amber / Green vs. target)
- The personal dashboard Financial tab shows progress vs. goal at a glance
- Leadership report gets a "% of target" column per category
- Pipeline coverage ratio becomes meaningful (pipeline ÷ remaining target)

This is the single change that turns ICT SalesIQ from a reporting tool into a management tool.

### 3b — Weighted Pipeline Forecast

Uses historical win rates by category (from Phase 2 analysis) combined with current pipeline to produce a probability-weighted revenue forecast. Shows:

- Best case (all pipeline closes)
- Weighted forecast (pipeline × category win rate)
- Committed (deals in advanced stages)
- Gap to target

Updated automatically as pipeline changes. No AI needed — straight maths on existing data.

### 3c — Commission Engine

Complete the commission module scaffolded in Phase 1. Configurable per rep:

- Base commission rate (% of revenue or GP)
- Tiered rates above target
- Accelerators by category or deal type

Reps see their own earnings trajectory in real time on their personal dashboard. Managers see team commission exposure. Prevents end-of-quarter surprises.

### 3d — Cohort Analysis

Group customers by first-win year. Track whether they expand, stay flat, or churn over subsequent years. Identifies:

- Best customer acquisition cohorts
- Which customers are growing vs. fading
- Average customer lifetime value by cohort

Feeds into account prioritisation on the personal dashboard.

---

## Phase 4 — Autotask & Quote Integration
**Removes manual data dependency entirely.**

### 4a — Complete Autotask API Sync

The sync infrastructure is already scaffolded (probe/status/sync routes, client, transformer). Complete the full sync so:

- Opportunities update automatically (no more CSV uploads)
- Status changes, close dates, and financials reflect in real time
- The sync log is visible on the Ops tab of the personal dashboard
- Failed syncs surface as an action item on the morning brief

This is the most important infrastructure change. Everything downstream gets more reliable.

**Known fixed (July 2026):** a `composite_key` unique-constraint collision was silently failing whole 500-row upsert batches, dropping ~200-260 legitimate opportunities per sync (including recently closed deals) since 6/22. Fixed by retrying failed batches row-by-row so only the actual colliding record is skipped and logged — see [sync.ts](src/lib/autotask/sync.ts).

**Deferred — incremental sync (revisit post-Phase 2):** the sync currently does a full fetch + full upsert of every opportunity (~7,300 records, ~80s) on every run, because an earlier incremental-sync attempt filtered on the wrong field name (`lastActivityDate`, which doesn't exist) and was assumed impossible for this entity. Context7 confirms Autotask's actual field is `lastActivity`, and Autotask's own best-practice guidance is to filter on it for incremental polling. Opportunities does not support webhooks, so polling is the only option — but it can be a smart poll instead of a full one. Planned approach:
- Daily: filter `lastActivity >= lastSyncTimestamp`, upsert only changed records.
- Weekly (or monthly): full resync as a safety net against clock skew, missed edge cases, or deletions.
- Lower priority than Phase 2 — current full-sync approach works, just inefficient. Revisit once Phase 2 is live.

### 4b — Kaseya Quote Manager Integration

Link quotes to opportunities. When a quote is issued in Kaseya, it attaches to the matching opportunity in SalesIQ. This surfaces:

- Quote issued date → days from opportunity to quote (velocity metric)
- Quote value vs. opportunity value (are we quoting what we scoped?)
- Quote status — sent, viewed, accepted, expired
- Deals where a quote was issued but no close has happened (follow-up flag on action list)

### 4c — Activity Age Tracking

Once Autotask sync is live, track last-activity date accurately. A deal with no Autotask activity in 30+ days flags on the action list regardless of its status. This is the simplest possible proxy for deal health without a full CRM.

---

## Phase 5 — Integrations & Enrichment
**Extends the platform beyond internal data.**

### 5a — Microsoft Teams / Outlook Digest

A daily summary pushed to a Teams channel (or email) at 8am. Contains the same morning brief from the personal dashboard — new wins, action items, pipeline changes. Means the digest arrives in Outlook before the dashboard is even opened. Built using Microsoft Graph API or a Power Automate webhook.

### 5b — Calendar Integration (Microsoft Graph)

Pull meeting data from Outlook calendar and match meetings to companies in the opportunity list. This gives a simple "last meeting date" per deal — a much better activity signal than relying on Autotask notes. Deals with no meeting in 30+ days flag automatically.

### 5c — Competitor Tracking

Add a competitor field (or tag) to opportunities. Over time, build a win rate by competitor view:

- Which competitors appear most often
- Win rate when competing against each
- Which categories each competitor appears in
- Deal size patterns where we lose on price vs. value

Lightweight to implement, high value for commercial strategy.

### 5d — Firmographic Enrichment

Enrich company records with employee count, turnover, and sector via Companies House API (free) or a data provider. Enables slicing wins and pipeline by customer size — useful for understanding whether ICT is over-indexed on SMB vs. mid-market.

### 5e — Power BI / Export Layer

For board-ready reporting, an export route that sends current data to Power BI or produces a formatted Excel/PDF snapshot. Covers the use case where leadership wants a polished presentation rather than a live screen share.

### 5f — Billing Reconciliation

If a recurring revenue / managed services billing system exists, link billed ARR to won opportunities. Surfaces the gap between what was sold and what is actually invoiced — a common blind spot in MSP businesses.

---

## Phase 6 — Intelligence Layer
**Makes the platform proactive, not just reactive.**

### 6a — Deal Health Score

A composite score per opportunity combining: age, overdue status, margin, activity recency, deal size, and category win rate. Surfaces as a single number (or RAG colour) next to each deal. Replaces the manual scanning currently required to identify which pipeline deals are at risk.

### 6b — Churn / Expansion Signals

Using historical data, identify patterns in customer records that preceded churn or expansion. Flag current customers who match churn patterns. This is achievable with basic statistical analysis once enough historical data exists — no ML required initially.

### 6c — Automated Anomaly Alerts

Daily check against thresholds:
- Margin dropped below X% on a new win
- Large deal (> €X) moved to lost
- Pipeline coverage fell below 1.5× target
- No wins logged in 7+ days

Pushed to Teams or the morning brief immediately. Means you don't have to check — exceptions come to you.

---

## Immediate Next Steps (this sprint)

1. **Morning brief strip** — single component at top of personal dashboard. No backend changes needed, pure client-side derivation from existing data props.
2. **Action list panel** — scored deal list on the personal dashboard. Same — works with current data.
3. **Deal timeline view** — quarter calendar on the Sales tab.
4. **Complete Autotask sync** — finish the scaffolded routes so CSV uploads become optional.
5. **Win/loss analysis panel** — Sales tab, existing data only.

---

## Open Questions

- Who else gets a personal dashboard? (same `/dashboard/[name]` pattern, role-gated)
- Should the morning brief be a push notification or pull-on-login only?
- What's the target commission structure for Phase 3? (needed to spec the engine)
- Is there a Teams channel to target for the Phase 5 digest?
- Which billing system is in use — relevant for Phase 5f?

---

*This document lives in the project repo and should be updated as phases are completed or priorities shift.*
