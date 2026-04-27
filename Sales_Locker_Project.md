# 📊 Sales Reporting & Forecasting Platform

### Project Overview (Project.md)

---

# 1. 🎯 Purpose of this Project

The objective is to build a **centralised internal sales platform** that replaces spreadsheets and becomes the **single operational layer for all sales activity**.

This platform will:

* Use Autotask CRM as the **single source of truth**
* Consolidate all reporting, forecasting, and performance tracking
* Provide real-time visibility into:

  * Pipeline
  * Revenue
  * Margin
  * Forecasting
  * Sales performance
* Evolve into a **modular internal system** (similar in structure to HR-style SaaS platforms)

---

# 2. 🧠 Core Philosophy & Key Decisions

## 2.1 Single Source of Truth

**Decision:**

* Autotask CRM is the **only authoritative data source**

**Why:**

* Prevents conflicting data across systems
* Eliminates double counting
* Ensures consistent reporting logic

---

## 2.2 Role of Other Systems

* Kaseya Quote Manager will NOT be used in the initial build
* It will be introduced later as an **enrichment layer only**

**Why:**

* Avoids complexity and data conflicts early
* Keeps MVP clean and accurate

---

## 2.3 Modular Architecture Principle

**Decision:**
The system must be built in a **modular way**, allowing new features to be added without breaking existing functionality.

**Why:**

* Enables phased rollout
* Reduces rebuild risk
* Supports long-term scalability

---

## 2.4 Product Vision

This platform will evolve into an internal system similar to HR platforms (e.g. HRLocker):

**Core characteristics:**

* Secure login
* Role-based access
* Modular sections
* Clean dashboards
* Admin control layer

Working concept:

👉 **“SalesLocker” – an internal sales operations platform**

---

# 3. 🧱 System Architecture

## Frontend

* Next.js
* Tailwind CSS

## Backend

* Supabase (PostgreSQL)

## Data Input

* CSV upload (initial)
* API integration (future)

## Access Control (future)

* Admin
* Sales Manager
* Sales Rep
* Read-only (Leadership)

---

# 4. 📂 Data Source & Structure

## 4.1 Data Source

* Autotask Opportunities Export
* Timeframe: 1st January → Present
* Includes all statuses and stages

---

## 4.2 Core Data Table

### `opportunities`

| Field                | Description         |
| -------------------- | ------------------- |
| id                   | System-generated ID |
| company              | Customer name       |
| opportunity_name     | Opportunity title   |
| owner                | Sales owner         |
| account_manager      | Account manager     |
| category             | Sales category      |
| stage                | Sales stage         |
| status               | Opportunity status  |
| created_date         | Creation date       |
| projected_close_date | Expected close      |
| closed_date          | Actual close        |
| revenue              | Total revenue       |
| cost                 | Total cost          |
| gross_profit         | Revenue - Cost      |
| gross_margin_pct     | Margin %            |
| last_activity        | Last activity       |
| age_days             | Opportunity age     |

---

# 5. ⚙️ Core Business Logic

## 5.1 Status Definitions

### Pipeline

```text
Status = Active
```

### On Hold

```text
Status = Not Ready
```

### Won

```text
Status = Closed - Won
OR Status = Implemented
```

### Lost

```text
Status = Lost
```

---

## 5.2 Overdue Logic

```text
Status = Active
AND Projected Close Date > 7 days in the past
```

---

## 5.3 Forecasting Logic

### Forecast Month

```text
Projected Close Date
```

### Revenue Recognition

```text
Closed Date
```

Fallback:

```text
Projected Close Date
```

---

# 6. 📊 Module 1 — Core Dashboard (MVP)

## Summary Metrics

* Total Pipeline €
* Total Won €
* Total Lost €
* Total Gross Profit €
* Win Rate %

---

## Pipeline Breakdown

* By Category
* By Customer
* By Owner

---

## Risk Indicators

* Overdue opportunities
* No activity (14+ days)
* Stalled deals

---

## Performance Metrics

* Wins by rep
* Margin by rep
* Conversion rate

---

# 7. 📊 Module 2 — Targets & Performance (Phase 2)

## Purpose

Track sales performance against defined goals

## Features

* Monthly / quarterly / annual targets
* Revenue and margin targets
* Category-based targets
* Rep-level dashboards

## Data Tables

### `targets`

* rep
* period
* revenue_target
* margin_target

---

# 8. 💰 Module 3 — Commission & Earnings (Phase 3)

## Purpose

Create a structured, transparent commission system

## Status

❗ Not part of MVP — to be implemented after core reporting stabilises

---

## 8.1 Commission Philosophy

* Commission is based on **margin, not revenue**
* Designed to:

  * Reward profitable deals
  * Encourage new business
  * Drive behaviour

---

## 8.2 Data Tables

### `commission_rules`

* deal_type
* customer_type (new/existing)
* commission_percentage
* thresholds
* accelerators

---

### `commission_results`

* opportunity_id
* owner
* margin
* commission_rate
* commission_value
* period (quarter)
* paid_status

---

## 8.3 Commission Logic (Example)

```text
IF deal_type = hardware AND new_customer
→ commission = 15% of margin

IF deal_type = maintenance AND existing_customer
→ commission = 4% of margin
```

---

## 8.4 Outputs

### For Reps

* Live commission tracker
* Earnings forecast
* Target progress

---

### For Leadership

* Cost of sales
* Rep profitability
* Incentive analysis

---

# 9. 🧪 Module 4 — Data Quality & Governance (Phase 2)

## Purpose

Ensure data integrity and reporting accuracy

## Features

* Missing fields detection
* Stale opportunities
* Incorrect statuses
* Data completeness scoring

---

# 10. 🔄 Module 5 — Forecasting Engine (Phase 2/3)

## Features

* Weighted pipeline
* Best case / commit / upside
* Forecast accuracy tracking
* Deal slippage tracking

---

# 11. 🔗 Module 6 — Quote Integration (Phase 4)

## Source

Kaseya Quote Manager

## Purpose

* Enhance opportunity data
* Provide margin validation
* Track quote lifecycle

## Structure

### `quotes`

* quote_id
* opportunity_id
* quote_value
* quote_status
* created_date
* expiry_date

---

# 12. ⚠️ Known Data Considerations

* No unique opportunity ID → generated internally
* Stage inconsistencies
* Category inconsistencies
* Currency formatting
* Multiple opportunities per deal

---

# 13. 🧠 Key Principles

1. Simplicity first
2. Accuracy over complexity
3. Modular design
4. Single source of truth
5. Build iteratively

---

# 14. 🚀 Roadmap

## Phase 1 (Current)

* CSV ingestion
* Core dashboard
* Business logic

---

## Phase 2

* Targets
* Data quality
* Rep dashboards
* Forecasting

---

## Phase 3

* Commission engine
* Earnings tracking

---

## Phase 4

* API integration
* Automation
* Quote integration

---

# 15. 🏁 Summary

This project is building:

👉 A **Sales Operations Platform**

Not:

* A CRM replacement
* A simple dashboard

This system will:

✔ Replace spreadsheet reporting
✔ Provide accurate, real-time insights
✔ Enable forecasting and performance tracking
✔ Support commission and incentive structures
✔ Scale into a full internal product

---

**End of Document**
