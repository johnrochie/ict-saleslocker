import type { Opportunity } from '@/types'

interface ExportArgs {
  deals: Opportunity[]          // every won deal in the date range (all customers)
  customer: string              // '' = all customers
  periodLabel: string
}

const EUR = '€#,##0;[Red]-€#,##0'
const HEADER_FILL = 'FF1E3A5F'

function dealDate(o: Opportunity): Date | null {
  const s = o.closed_date || o.created_date
  return s ? new Date(s) : null
}

/**
 * Builds a workbook where the Deals sheet is the source of truth and the
 * Category / Company sheets are SUMIFS formulas over it. Edit a value, category
 * or company on the Deals sheet (or add/delete rows within the table range) and
 * the totals recalculate.
 */
export async function exportCustomerQbrXlsx({ deals, customer, periodLabel }: ExportArgs) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ICT SalesIQ'

  const style = (ws: import('exceljs').Worksheet) => {
    const row = ws.getRow(1)
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  }

  // Sort deals by company, then value so the sheet is easy to scan and edit.
  const sorted = [...deals].sort((a, b) =>
    (a.company || '').localeCompare(b.company || '') || b.revenue_total - a.revenue_total)

  // ── Deals (source data) ────────────────────────────────────────────────────
  const wsD = wb.addWorksheet('Deals')
  wsD.columns = [
    { header: 'Company',     key: 'company',  width: 34 },
    { header: 'Opportunity', key: 'name',     width: 44 },
    { header: 'Category',    key: 'category', width: 26 },
    { header: 'Closed',      key: 'closed',   width: 13 },
    { header: 'Value (€)',   key: 'value',    width: 14 },
  ]
  style(wsD)
  sorted.forEach(o => {
    wsD.addRow({
      company: o.company || 'Unknown',
      name: o.opportunity_name,
      category: o.category || 'Uncategorised',
      closed: dealDate(o) ?? null,
      value: o.revenue_total,
    })
  })
  const last = Math.max(sorted.length + 1, 2)
  wsD.getColumn('closed').numFmt = 'dd mmm yyyy'
  wsD.getColumn('value').numFmt = EUR
  wsD.views = [{ state: 'frozen', ySplit: 1 }]
  wsD.autoFilter = { from: 'A1', to: `E${last}` }

  const rngCompany = `Deals!$A$2:$A$${last}`
  const rngCat     = `Deals!$C$2:$C$${last}`
  const rngValue   = `Deals!$E$2:$E$${last}`

  const inScope = customer ? sorted.filter(o => (o.company || 'Unknown') === customer) : sorted
  const scopeTotal = inScope.reduce((s, o) => s + o.revenue_total, 0)

  // ── By Category ────────────────────────────────────────────────────────────
  const catMap = new Map<string, { count: number; rev: number }>()
  inScope.forEach(o => {
    const k = o.category || 'Uncategorised'
    const e = catMap.get(k) || { count: 0, rev: 0 }
    e.count++; e.rev += o.revenue_total
    catMap.set(k, e)
  })
  const cats = Array.from(catMap.entries()).sort((a, b) => b[1].rev - a[1].rev)

  const wsC = wb.addWorksheet('By Category')
  wsC.getCell('A1').value = `Opportunity Category totals — ${customer || 'All customers'}`
  wsC.getCell('A1').font = { bold: true, size: 14 }
  wsC.getCell('A2').value = `Won deals closed ${periodLabel}`
  wsC.getCell('A3').value = 'Customer filter (blank = all):'
  wsC.getCell('B3').value = customer
  wsC.getCell('B3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
  const hdr = 5
  ;['Category', 'Deals', 'Value (€)', '% of total'].forEach((h, i) => { wsC.getCell(hdr, i + 1).value = h })
  wsC.getRow(hdr).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsC.getRow(hdr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }

  const first = hdr + 1
  const lastCat = hdr + Math.max(cats.length, 1)
  const totalRow = lastCat + 1
  cats.forEach(([name, d], i) => {
    const r = first + i
    wsC.getCell(r, 1).value = name
    // "*" wildcard matches any company when the filter cell is blank.
    wsC.getCell(r, 2).value = {
      formula: `COUNTIFS(${rngCat},$A${r},${rngCompany},IF($B$3="","*",$B$3))`, result: d.count,
    }
    wsC.getCell(r, 3).value = {
      formula: `SUMIFS(${rngValue},${rngCat},$A${r},${rngCompany},IF($B$3="","*",$B$3))`, result: d.rev,
    }
    wsC.getCell(r, 4).value = {
      formula: `IF($C$${totalRow}=0,0,C${r}/$C$${totalRow})`, result: scopeTotal ? d.rev / scopeTotal : 0,
    }
  })
  wsC.getCell(totalRow, 1).value = 'Total'
  wsC.getCell(totalRow, 2).value = { formula: `SUM(B${first}:B${lastCat})`, result: inScope.length }
  wsC.getCell(totalRow, 3).value = { formula: `SUM(C${first}:C${lastCat})`, result: scopeTotal }
  wsC.getCell(totalRow, 4).value = { formula: `SUM(D${first}:D${lastCat})`, result: scopeTotal ? 1 : 0 }
  wsC.getRow(totalRow).font = { bold: true }
  wsC.getRow(totalRow).border = { top: { style: 'thin' } }
  wsC.getColumn(1).width = 34
  wsC.getColumn(2).width = 10
  wsC.getColumn(3).width = 16
  wsC.getColumn(4).width = 12
  wsC.getColumn(3).numFmt = EUR
  wsC.getColumn(4).numFmt = '0.0%'
  wsC.getCell(`A${totalRow + 2}`).value =
    'Totals are formulas over the Deals sheet. If you add a new category, copy a row down and change the name.'
  wsC.getCell(`A${totalRow + 2}`).font = { italic: true, color: { argb: 'FF6B7280' } }

  // ── By Company ─────────────────────────────────────────────────────────────
  const coMap = new Map<string, { count: number; rev: number }>()
  sorted.forEach(o => {
    const k = o.company || 'Unknown'
    const e = coMap.get(k) || { count: 0, rev: 0 }
    e.count++; e.rev += o.revenue_total
    coMap.set(k, e)
  })
  const cos = Array.from(coMap.entries()).sort((a, b) => b[1].rev - a[1].rev)
  const allTotal = cos.reduce((s, [, d]) => s + d.rev, 0)

  const wsP = wb.addWorksheet('By Company')
  wsP.columns = [
    { header: 'Company',   key: 'a', width: 40 },
    { header: 'Deals',     key: 'b', width: 10 },
    { header: 'Spend (€)', key: 'c', width: 16 },
  ]
  style(wsP)
  cos.forEach(([name, d], i) => {
    const r = i + 2
    wsP.getCell(r, 1).value = name
    wsP.getCell(r, 2).value = { formula: `COUNTIFS(${rngCompany},$A${r})`, result: d.count }
    wsP.getCell(r, 3).value = { formula: `SUMIFS(${rngValue},${rngCompany},$A${r})`, result: d.rev }
  })
  const lastCo = Math.max(cos.length + 1, 2)
  const coTotal = lastCo + 1
  wsP.getCell(coTotal, 1).value = 'Total (all companies)'
  wsP.getCell(coTotal, 2).value = { formula: `SUM(B2:B${lastCo})`, result: sorted.length }
  wsP.getCell(coTotal, 3).value = { formula: `SUM(C2:C${lastCo})`, result: allTotal }
  wsP.getRow(coTotal).font = { bold: true }
  wsP.getRow(coTotal).border = { top: { style: 'thin' } }
  wsP.getColumn('c').numFmt = EUR
  wsP.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const safe = (customer || 'All customers').replace(/[^\w\- ]+/g, '').trim() || 'All customers'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Customer QBR - ${safe}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
}
