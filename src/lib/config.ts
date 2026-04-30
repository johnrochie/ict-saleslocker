// ============================================================
// ICT SalesLocker -- Shared Configuration
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
  { key: "O'Hora, Evan",       first: 'Evan',    display: 'Evan O\'Hora'      },
  { key: 'Roche, John',        first: 'JR',      display: 'John Roche'        },
  { key: 'Taylor, Jamie',      first: 'Jamie',   display: 'Jamie Taylor'      },
]

export const SALES_TEAM_KEYS = SALES_TEAM.map(r => r.key)

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
