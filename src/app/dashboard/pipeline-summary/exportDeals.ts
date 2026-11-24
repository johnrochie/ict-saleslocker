import type { Opportunity } from '@/types'

interface ExportArgs {
  won: Opportunity[]
  open: Opportunity[]
  lost: Opportunity[]
  periodLabel: string
  filterNote: string   // which filters were active, so the file explains itself
}

const EUR = '€#,##0;[Red]-€#,##0'
const HEADER_FILL = 'FF1E3A5F'

/** One sheet each for Wins, Open pipeline and Lost, plus a Summary of the filters used. */
export async function exportDealDetailXlsx({ won, open, lost, periodLabel, filterNote }: ExportArgs) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ICT SalesIQ'

  const sheet = (name: string, deals: Opportunity[], dateHeader: string, dateOf: (o: Opportunity) => string | null) => {
    const ws = wb.addWorksheet(name)
    ws.columns = [
      { header: 'Company',     key: 'company',  width: 32 },
      { header: 'Opportunity', key: 'name',     width: 44 },
      { header: 'Owner',       key: 'owner',    width: 22 },
      { header: 'Category',    key: 'category', width: 24 },
      { header: 'Stage',       key: 'stage',    width: 28 },
      { header: dateHeader,    key: 'date',     width: 16 },
      { header: 'Revenue (€)', key: 'revenue',  width: 14 },
      { header: 'Cost (€)',    key: 'cost',     width: 14 },
      { header: 'Profit (€)',  key: 'gp',       width: 14 },
      { header: 'Margin %',    key: 'margin',   width: 11 },
      { header: 'Cost missing', key: 'nocost',  width: 13 },
    ]
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }

    const sorted = [...deals].sort((a, b) => b.revenue_total - a.revenue_total)
    sorted.forEach((o, i) => {
      const r = i + 2
      ws.addRow({
        company: o.company || 'Unknown',
        name: o.opportunity_name,
        owner: o.opportunity_owner || '',
        category: o.category || 'Uncategorised',
        stage: o.stage || '',
        date: dateOf(o) ? new Date(dateOf(o)!) : null,
        revenue: o.revenue_total,
        cost: o.cost_missing ? null : o.cost_total,
        // Profit and margin are formulas so edits to revenue/cost flow through.
        gp: o.cost_missing ? null : { formula: `G${r}-H${r}` },
        margin: o.cost_missing ? null : { formula: `IF(G${r}=0,0,I${r}/G${r})` },
        nocost: o.cost_missing ? 'Yes' : '',
      })
    })
    const last = sorted.length + 1
    const has = sorted.length > 0   // an empty range would make the total row sum itself
    const total = ws.addRow({
      company: `TOTAL (${sorted.length} deals)`,
      revenue: has ? { formula: `SUM(G2:G${last})` } : 0,
      cost:    has ? { formula: `SUM(H2:H${last})` } : 0,
      gp:      has ? { formula: `SUM(I2:I${last})` } : 0,
      margin:  has ? { formula: `IF(G${last + 1}=0,0,I${last + 1}/G${last + 1})` } : 0,
    })
    total.font = { bold: true }
    ws.getColumn('date').numFmt = 'dd mmm yyyy'
    ;['revenue', 'cost', 'gp'].forEach(k => { ws.getColumn(k).numFmt = EUR })
    ws.getColumn('margin').numFmt = '0.0%'
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: 'A1', to: `K${Math.max(last, 2)}` }
  }

  const closed = (o: Opportunity) => o.closed_date || o.created_date
  sheet('Wins', won, 'Closed', closed)
  sheet('Open pipeline', open, 'Projected close', o => o.projected_close_date)
  sheet('Lost', lost, 'Closed', closed)

  const ws = wb.addWorksheet('Filters used', { properties: { tabColor: { argb: HEADER_FILL } } })
  ws.columns = [{ width: 22 }, { width: 90 }]
  ws.addRows([
    ['Wins / Lost period', periodLabel],
    ['Filters', filterNote],
    ['Margin', 'Profit divided by revenue. Deals with no cost recorded are left blank and are not included in cost or profit totals, so total margin is overstated if any are present.'],
    ['Exported', new Date().toLocaleString('en-IE')],
  ])
  ws.getColumn(1).font = { bold: true }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Deal detail ${new Date().toISOString().split('T')[0]}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
