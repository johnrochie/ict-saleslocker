// ============================================================
// ICT SalesIQ — Account Management Review, PowerPoint export
// Builds a clean, editable deck for one AM and one month: a title
// slide, then one slide per review section (long tables continue
// onto an extra slide rather than shrinking the text).
// ============================================================

import type { Data, Rep } from './AccountManagementClient'
import { formatDate } from '@/lib/utils/formatting'

const BRAND = 'D4145A'
const NAVY  = '1A3A5C'
const GREY  = '6B7280'
const LINE  = 'E5E7EB'
const SOFT  = 'F3F4F6'
const FONT  = 'Calibri'

const eur = (n: number) => '€' + Math.round(n).toLocaleString('en-IE')
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const signed = (n: number) => (n > 0 ? '+' : '') + num(Math.round(n * 10) / 10)
const date = (d: string | null) => (d ? formatDate(d) : '—')
const tierText = (t: string | null) => (t ? `T${t}` : 'Not listed')

interface Kpi { label: string; value: string; sub?: string }
interface Section {
  kicker: string; title: string; subtitle: string
  kpis?: Kpi[]
  head: string[]; widths: number[]; rows: string[][]
  empty: string
  perSlide?: number   // rows per slide, when rows may wrap
}

export async function exportReviewPptx(data: Data, rep: Rep) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'   // 13.33 x 7.5 in
  pptx.title  = `Account Management Review ${data.month.label} - ${rep.display}`
  pptx.company = 'ICT Services'

  const footer = (slide: ReturnType<typeof pptx.addSlide>) => {
    slide.addText(`ICT Services  ·  Account Management Review  ·  ${rep.display}  ·  ${data.month.label}`,
      { x: 0.6, y: 7.05, w: 11, h: 0.3, fontFace: FONT, fontSize: 10, color: GREY })
  }

  // ── Title slide ────────────────────────────────────────────
  const cover = pptx.addSlide()
  cover.background = { color: NAVY }
  cover.addShape('rect', { x: 0.6, y: 2.55, w: 0.9, h: 0.07, fill: { color: BRAND }, line: { color: BRAND } })
  cover.addText(data.month.label, { x: 0.6, y: 1.8, w: 11, h: 0.6, fontFace: FONT, fontSize: 22, color: 'D1D5DB' })
  cover.addText('Account Management Review', { x: 0.6, y: 2.8, w: 12, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF' })
  cover.addText(`Account Manager: ${rep.display}`, { x: 0.6, y: 3.9, w: 12, h: 0.5, fontFace: FONT, fontSize: 20, color: 'FFFFFF' })
  cover.addText('ICT Services', { x: 0.6, y: 6.7, w: 6, h: 0.4, fontFace: FONT, fontSize: 14, color: 'D1D5DB' })

  // ── One slide (or more, if the table is long) per section ──
  function addSection(sec: Section) {
    const perSlide = sec.perSlide ?? (sec.kpis ? 7 : 10)
    const chunks: string[][][] = []
    for (let i = 0; i < sec.rows.length; i += perSlide) chunks.push(sec.rows.slice(i, i + perSlide))
    if (chunks.length === 0) chunks.push([])

    chunks.forEach((chunk, idx) => {
      const slide = pptx.addSlide()
      slide.background = { color: 'FFFFFF' }
      slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.12, fill: { color: BRAND }, line: { color: BRAND } })
      slide.addText(sec.kicker.toUpperCase(), { x: 0.6, y: 0.35, w: 8, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: BRAND, charSpacing: 2 })
      slide.addText(idx > 0 ? `${sec.title} (continued)` : sec.title,
        { x: 0.6, y: 0.65, w: 12, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: NAVY })
      slide.addText(sec.subtitle, { x: 0.6, y: 1.25, w: 12, h: 0.4, fontFace: FONT, fontSize: 14, color: GREY })

      let tableY = 1.9
      if (sec.kpis && idx === 0) {
        const n = sec.kpis.length, gap = 0.2, w = (12.13 - gap * (n - 1)) / n
        sec.kpis.forEach((k, i) => {
          const x = 0.6 + i * (w + gap)
          slide.addShape('roundRect', { x, y: 1.85, w, h: 1.1, fill: { color: SOFT }, line: { color: LINE, width: 0.75 }, rectRadius: 0.08 })
          slide.addText(k.label.toUpperCase(), { x: x + 0.15, y: 1.92, w: w - 0.3, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: GREY })
          slide.addText(k.value, { x: x + 0.15, y: 2.18, w: w - 0.3, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color: NAVY })
          if (k.sub) slide.addText(k.sub, { x: x + 0.15, y: 2.66, w: w - 0.3, h: 0.25, fontFace: FONT, fontSize: 10, color: GREY })
        })
        tableY = 3.2
      } else if (sec.kpis) {
        tableY = 1.9
      }

      if (chunk.length === 0) {
        slide.addText(sec.empty, { x: 0.6, y: tableY + 0.1, w: 12, h: 0.5, fontFace: FONT, fontSize: 16, italic: true, color: GREY })
      } else {
        const head = sec.head.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 11 } }))
        const body = chunk.map((r, ri) => r.map((c, ci) => ({
          text: c,
          options: { color: ci === 0 ? NAVY : '374151', bold: ci === 0, fill: { color: ri % 2 ? SOFT : 'FFFFFF' }, fontSize: 11 },
        })))
        slide.addTable([head, ...body], {
          x: 0.6, y: tableY, w: 12.13, colW: sec.widths, rowH: 0.42,
          fontFace: FONT, valign: 'middle', margin: [0, 0.08, 0, 0.08],
          border: { type: 'solid', pt: 0.5, color: LINE },
        })
      }
      footer(slide)
    })
  }

  const variance = rep.held.length - rep.target
  const pct = rep.target > 0 ? Math.round((rep.held.length / rep.target) * 100) : 0
  const avgOpp = rep.opps.monthCount > 0 ? rep.opps.monthValue / rep.opps.monthCount : 0
  const gap = rep.nextMonthPlanned.length - rep.nextMonthTarget

  addSection({
    kicker: '01 · Meetings', title: `Meetings conducted in ${data.month.label}`,
    subtitle: `${rep.held.length} meetings held against a target of ${num(rep.target)}.`,
    kpis: [
      { label: 'Meetings held', value: String(rep.held.length), sub: 'Logged in Autotask' },
      { label: 'Target', value: num(rep.target), sub: rep.overrideScope ? 'Set by manager' : `${rep.customerCount} customers by tier` },
      { label: 'Variance', value: signed(variance), sub: 'Actual minus target' },
      { label: '% of target', value: `${pct}%`, sub: 'Actual ÷ target' },
    ],
    head: ['Customer', 'Tier', 'Contact', 'Date'], widths: [5.2, 1.4, 3.7, 1.83],
    rows: rep.held.map(m => [m.company, tierText(m.tier), m.contact ?? '—', date(m.start_date)]),
    empty: 'No meetings held this month.',
  })

  // One row per customer met, with the growth opportunities raised for them
  const met = new Map<string, Rep['held'][number]>()
  rep.held.forEach(m => { if (!met.has(m.company)) met.set(m.company, m) })
  addSection({
    kicker: '02 · Customers', title: 'Customers met',
    subtitle: `${met.size} customers visited this month, and the growth opportunities raised for each.`,
    head: ['Customer', 'Tier', 'Contact', 'Met', 'Growth opportunities raised'], widths: [3.2, 1.1, 2.4, 1.3, 4.13],
    rows: [...met.values()].map(m => {
      const opps = rep.opps.month.filter(o => o.company.toLowerCase() === m.company.toLowerCase())
      return [m.company, tierText(m.tier), m.contact ?? '—', date(m.start_date),
        opps.length ? opps.map(o => `${o.name} (${eur(o.value)})`).join('; ') : 'None logged']
    }),
    empty: 'No customers met this month.',
    perSlide: 7,
  })

  addSection({
    kicker: '03 · Quotes', title: 'Opportunities and quotes generated from visits',
    subtitle: `${rep.opps.monthCount} raised in ${data.month.label} with Lead Source "${data.leadSource}", total value ${eur(rep.opps.monthValue)}.`,
    kpis: [
      { label: 'Raised', value: String(rep.opps.monthCount), sub: 'This month' },
      { label: 'Total value', value: eur(rep.opps.monthValue), sub: 'Excl. VAT' },
      { label: 'Average value', value: eur(avgOpp), sub: 'Total ÷ number' },
      { label: 'Won year to date', value: `${rep.opps.ytdWonCount} (${eur(rep.opps.ytdWonValue)})`, sub: `${rep.opps.openCount} open, ${eur(rep.opps.openValue)}` },
    ],
    head: ['Customer', 'Opportunity', 'Value', 'Stage', 'Status'], widths: [3.0, 4.2, 1.6, 1.8, 1.53],
    rows: rep.opps.month.map(o => [o.company, o.name, eur(o.value), o.stage ?? '—', o.status.replace('_', ' ')]),
    empty: 'No opportunities raised from visits this month.',
  })

  addSection({
    kicker: '04 · Plan', title: `Meetings planned for ${data.nextMonth.label}`,
    subtitle: `${rep.nextMonthPlanned.length} planned against a target of ${num(rep.nextMonthTarget)}. All must be scheduled in Autotask.`,
    kpis: [
      { label: 'Planned', value: String(rep.nextMonthPlanned.length), sub: 'Scheduled in Autotask' },
      { label: 'Target', value: num(rep.nextMonthTarget), sub: 'Agreed monthly target' },
      { label: 'Gap to target', value: signed(gap), sub: 'Planned minus target' },
    ],
    head: ['Customer', 'Tier', 'Contact', 'Date'], widths: [5.2, 1.4, 3.7, 1.83],
    rows: rep.nextMonthPlanned.map(m => [m.company, tierText(m.tier), m.contact ?? '—', date(m.start_date)]),
    empty: 'Nothing booked yet.',
  })

  const safe = rep.display.replace(/[^A-Za-z0-9 ]/g, '').trim()
  await pptx.writeFile({ fileName: `Account Management Review ${data.month.label} - ${safe}.pptx` })
}
