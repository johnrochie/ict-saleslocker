'use client'

import { useMemo, useState } from 'react'

export interface ChargeRow {
  id: number
  date: string | null
  company: string
  ticketNumber: string | null
  ticketTitle: string | null
  name: string
  qty: number
  sell: number
  cost: number
  billable: boolean
  billed: boolean
  invoicedAmount: number
  invoices: string[]
}

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function toInputDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export default function CustomerBillingClient({ rows, year }: { rows: ChargeRow[]; year: number }) {
  const today = new Date()
  const [dateFrom, setDateFrom] = useState(toInputDate(new Date(year, 0, 1)))
  const [dateTo, setDateTo]     = useState(toInputDate(today))
  const [customer, setCustomer] = useState('')
  const [search, setSearch]     = useState('')

  const inRange = useMemo(() => {
    const from = new Date(dateFrom)
    const to = new Date(dateTo); to.setHours(23, 59, 59)
    return rows.filter(r => r.date && new Date(r.date) >= from && new Date(r.date) <= to)
  }, [rows, dateFrom, dateTo])

  const companyRows = useMemo(() => {
    const map = new Map<string, { count: number; sell: number; invoiced: number }>()
    inRange.forEach(r => {
      const e = map.get(r.company) ?? { count: 0, sell: 0, invoiced: 0 }
      e.count++; e.sell += r.sell; e.invoiced += r.invoicedAmount
      map.set(r.company, e)
    })
    return Array.from(map.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.sell - a.sell)
  }, [inRange])

  const filteredCompanies = useMemo(() => {
    const q = search.toLowerCase().trim()
    return q ? companyRows.filter(r => r.name.toLowerCase().includes(q)) : companyRows
  }, [companyRows, search])

  const scoped = useMemo(
    () => customer ? inRange.filter(r => r.company === customer) : inRange,
    [inRange, customer],
  )

  const totals = useMemo(() => {
    const billable = scoped.filter(r => r.billable)
    return {
      charges:  scoped.length,
      sell:     billable.reduce((s, r) => s + r.sell, 0),
      cost:     scoped.reduce((s, r) => s + r.cost, 0),
      invoiced: scoped.reduce((s, r) => s + r.invoicedAmount, 0),
      unbilled: billable.filter(r => !r.billed).reduce((s, r) => s + r.sell, 0),
    }
  }, [scoped])

  const lines = useMemo(
    () => customer ? [...scoped].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) : [],
    [scoped, customer],
  )

  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50'
  const quick = [
    { label: 'YTD',        from: new Date(year, 0, 1),     to: today },
    { label: 'Last Year',  from: new Date(year - 1, 0, 1), to: new Date(year - 1, 11, 31) },
    { label: 'Last 12 Mo', from: new Date(year - 1, today.getMonth(), today.getDate()), to: today },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customer Billing</h1>
        <p className="text-sm text-gray-500">Ticket charges and what has been invoiced, by customer. Pick a customer to see their charge lines.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <label className="text-xs font-semibold text-gray-500 uppercase">From
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 normal-case" />
        </label>
        <label className="text-xs font-semibold text-gray-500 uppercase">To
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 normal-case" />
        </label>
        <div className="flex gap-2">
          {quick.map(q => (
            <button key={q.label} onClick={() => { setDateFrom(toInputDate(q.from)); setDateTo(toInputDate(q.to)) }}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">{q.label}</button>
          ))}
        </div>
        <label className="text-xs font-semibold text-gray-500 uppercase flex-1 min-w-[240px]">Customer
          <select value={customer} onChange={e => setCustomer(e.target.value)}
            className="block mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 normal-case">
            <option value="">All customers ({companyRows.length})</option>
            {[...companyRows].sort((a, b) => a.name.localeCompare(b.name)).map(r => (
              <option key={r.name} value={r.name}>{r.name} — {euros(r.sell)}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          No charge data yet. Run the charges sync (POST /api/autotask-qpo/sync) or wait for the 06:30 cron.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Charges" value={totals.charges.toLocaleString('en-IE')} />
        <Kpi label="Charged (billable)" value={euros(totals.sell)} />
        <Kpi label="Invoiced" value={euros(totals.invoiced)} />
        <Kpi label="Not yet invoiced" value={euros(totals.unbilled)} />
        <Kpi label="Cost" value={euros(totals.cost)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-900">By company</h2>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-40" />
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0"><tr>
                <th className={`${th} text-left`}>Company</th>
                <th className={`${th} text-right`}>Charges</th>
                <th className={`${th} text-right`}>Charged</th>
                <th className={`${th} text-right`}>Invoiced</th>
              </tr></thead>
              <tbody>
                {filteredCompanies.map(r => (
                  <tr key={r.name} onClick={() => setCustomer(customer === r.name ? '' : r.name)}
                    className={`cursor-pointer border-t border-gray-100 hover:bg-blue-50 ${customer === r.name ? 'bg-blue-100 font-semibold' : ''}`}>
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className="px-3 py-1.5 text-right">{r.count}</td>
                    <td className="px-3 py-1.5 text-right">{euros(r.sell)}</td>
                    <td className="px-3 py-1.5 text-right">{euros(r.invoiced)}</td>
                  </tr>
                ))}
                {filteredCompanies.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No charges in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {customer && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Charge lines — {customer}</h2>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={`${th} text-left`}>Date</th>
                <th className={`${th} text-left`}>Ticket</th>
                <th className={`${th} text-left`}>Charge</th>
                <th className={`${th} text-right`}>Qty</th>
                <th className={`${th} text-right`}>Charged</th>
                <th className={`${th} text-right`}>Cost</th>
                <th className={`${th} text-left`}>Invoice</th>
              </tr></thead>
              <tbody>
                {lines.map(r => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-1.5">{r.ticketNumber ?? '—'}{r.ticketTitle ? <span className="text-gray-400"> · {r.ticketTitle}</span> : null}</td>
                    <td className="px-3 py-1.5">
                      {r.name}
                      {!r.billable && <span className="ml-2 text-xs text-gray-400">(non-billable)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">{r.qty}</td>
                    <td className="px-3 py-1.5 text-right">{euros(r.sell)}</td>
                    <td className="px-3 py-1.5 text-right">{euros(r.cost)}</td>
                    <td className="px-3 py-1.5">
                      {r.invoices.length ? r.invoices.join(', ')
                        : r.billable ? <span className="text-amber-600">Not invoiced</span> : '—'}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No charges in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Charged = ticket charge sell value (billable charges only). Invoiced = billing items linked to the charge. Dated by charge create date. Data syncs daily from Autotask at 06:30.
      </p>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}
