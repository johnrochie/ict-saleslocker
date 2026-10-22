// ============================================================
// ICT SalesIQ -- Shared Configuration
// Single source of truth for team membership and shared utilities
// Update this file when the sales team changes
// ============================================================

export interface SalesRepConfig {
  key: string        // exact Autotask name (Surname, Firstname)
  first: string      // short name used in narrative (e.g. "JR", "Jamie")
  display: string    // full display name (Firstname Surname)
}

export const SALES_TEAM: SalesRepConfig[] = [
  { key: 'Maciejska, Barbara', first: 'Barbara', display: 'Barbara Maciejska' },
  { key: 'Conboy, John',       first: 'John C',  display: 'John Conboy'       },
  { key: 'Dowdall, James',     first: 'James D', display: 'James Dowdall'     },
  { key: "O'Brien, Gary",      first: 'Gary',    display: 'Gary O\'Brien'     },
  { key: "O'Hora, Evan",       first: 'Evan',    display: 'Evan O\'Hora'      },
  { key: 'Roche, John',        first: 'JR',      display: 'John Roche'        },
  { key: 'Taylor, Jamie',      first: 'Jamie',   display: 'Jamie Taylor'      },
]

export const SALES_TEAM_KEYS = SALES_TEAM.map(r => r.key)

/** Retail reps — their deals are classed 'portal' and kept out of sales reporting. */
export const RETAIL_REP_KEYS = ['Desmond, Tom', 'Ganly, Peter']

/** Returns true if the deal belongs to a member of the sales team */
export function isSalesTeamDeal(
  accountManager: string | null,
  opportunityOwner: string | null
): boolean {
  const am = accountManager || ''
  const oo = opportunityOwner || ''
  return SALES_TEAM_KEYS.includes(am) || SALES_TEAM_KEYS.includes(oo)
}

/** Returns the display name for a rep key (Surname, Firstname -> Firstname Surname) */
export function repDisplayName(key: string): string {
  const rep = SALES_TEAM.find(r => r.key === key)
  if (rep) return rep.display
  return key.includes(',')
    ? key.split(',').map(s => s.trim()).reverse().join(' ')
    : key
}

// ── Quarter utilities ─────────────────────────────────────

export interface QuarterBounds {
  from: string      // YYYY-MM-DD
  to: string        // YYYY-MM-DD
  label: string     // e.g. "Q2 2026"
  meetingDay: string // e.g. "Monday 28 Apr"
}

export function quarterBounds(year: number, quarter: number): QuarterBounds {
  const starts = ['01-01', '04-01', '07-01', '10-01']
  const ends   = ['03-31', '06-30', '09-30', '12-31']
  const from   = `${year}-${starts[quarter - 1]}`
  const to     = `${year}-${ends[quarter - 1]}`
  const monDate = new Date(from)
  return {
    from,
    to,
    label: `Q${quarter} ${year}`,
    meetingDay: monDate.toLocaleDateString('en-IE', { weekday: 'long', day: '2-digit', month: 'short' }),
  }
}

export function currentQuarter(): { year: number; quarter: number } {
  const now = new Date()
  return {
    year:    now.getFullYear(),
    quarter: Math.ceil((now.getMonth() + 1) / 3),
  }
}

export function weekBounds(weekOffset: number): {
  from: string; to: string; label: string; meetingDate: string
} {
  const today = new Date()
  const dow = today.getDay()
  const toMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(today)
  mon.setDate(today.getDate() + toMon + weekOffset * 7)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' })
  return {
    from:  mon.toISOString().slice(0, 10),
    to:    sun.toISOString().slice(0, 10),
    label: `${fmt(mon)} - ${fmt(sun)}`,
    meetingDate: mon.toLocaleDateString('en-IE', { weekday: 'long', day: '2-digit', month: 'short' }),
  }
}

// ── Month utilities ───────────────────────────────────────

export interface MonthBounds {
  from: string      // YYYY-MM-DD
  to: string        // YYYY-MM-DD
  label: string     // e.g. "July 2026"
  monthKey: string  // YYYY-MM
}

/** monthKey is "YYYY-MM"; defaults to the current month if omitted.
 *  Builds from/to as plain date strings (no toISOString/UTC conversion) —
 *  see weekBounds() for why that matters during Irish Summer Time. */
export function monthBounds(monthKey?: string): MonthBounds {
  const now = new Date()
  const [year, month] = monthKey
    ? monthKey.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1]
  const daysInMonth = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from:     `${year}-${pad(month)}-01`,
    to:       `${year}-${pad(month)}-${pad(daysInMonth)}`,
    label:    new Date(year, month - 1, 1).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' }),
    monthKey: `${year}-${pad(month)}`,
  }
}


// ── Account Management programme ──────────────────────────

/** Autotask "Lead Source" value the AM picks on an opportunity that came from a visit. */
export const AM_LEAD_SOURCE = 'Account Management Visit'

/** Autotask meeting action type that counts as an AM visit. */
export const AM_MEETING_TYPE = 'Account Management Meeting'

/** Used when an AM has no customers assigned yet (the old fixed target). */
export const AM_DEFAULT_MONTHLY_TARGET = 7

export type AmTier = '1+' | '1' | '2' | '3' | '4' | '5'

export interface AmTierConfig {
  tier: AmTier
  band: string            // revenue band, for display
  visitsPerYear: number   // face-to-face visit target (QBR = 4, HBR = 2, ABR = 1)
  callsPerYear: number    // AM phone calls, for tiers with no visit
  cadence: string
}

// From the Account Management process deck, "Engagement by tier (per year)".
// Tier 3 is "2 (HBR) / 1 (ABR)" on the slide; 2 is used as the target.
export const AM_TIERS: AmTierConfig[] = [
  { tier: '1+', band: '> €1M',          visitsPerYear: 4, callsPerYear: 0, cadence: 'Quarterly (QBR)'   },
  { tier: '1',  band: '€500K – €1M', visitsPerYear: 4, callsPerYear: 0, cadence: 'Quarterly (QBR)'   },
  { tier: '2',  band: '€250K – €500K', visitsPerYear: 4, callsPerYear: 0, cadence: 'Quarterly (QBR)'   },
  { tier: '3',  band: '€100K – €250K', visitsPerYear: 2, callsPerYear: 0, cadence: 'Half-yearly (HBR)' },
  { tier: '4',  band: '€25K – €100K',  visitsPerYear: 0, callsPerYear: 2, cadence: 'Phone, half-yearly' },
  { tier: '5',  band: '€0 – €25K',     visitsPerYear: 0, callsPerYear: 1, cadence: 'Phone, yearly'      },
]

export function amTierConfig(tier: string): AmTierConfig | undefined {
  return AM_TIERS.find(t => t.tier === tier)
}

/** "Jade McBride" -> "McBride, Jade" (Autotask resource name format). Names already in that form are returned as is. */
export function toAutotaskName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ')
  if (!n || n.includes(',')) return n
  const known = SALES_TEAM.find(r => r.display.toLowerCase() === n.toLowerCase())
  if (known) return known.key
  const parts = n.split(' ')
  return parts.length < 2 ? n : `${parts.slice(1).join(' ')}, ${parts[0]}`
}
