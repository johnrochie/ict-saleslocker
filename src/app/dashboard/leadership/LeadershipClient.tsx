'use client'

import { useEffect } from 'react'

interface CategoryTarget {
  category_name: string; gl_code: string | null
  annual_revenue_target: number; is_framework: boolean; sort_order: number
}

interface LeadershipClientProps {
  winsData:        Record<string, string>[]
  pipeData:        Record<string, string>[]
  categoryTargets: CategoryTarget[]
}

export default function LeadershipClient({ winsData, pipeData, categoryTargets }: LeadershipClientProps) {
  useEffect(() => {
    // Inject data into window so leadership.js can read it
    ;(window as any).__LEADERSHIP_DATA__ = { wins: winsData, pipe: pipeData, categoryTargets }

    const cleanup = () => { delete (window as any).__LEADERSHIP_DATA__ }

    // If leadership.js already ran (re-navigation), call buildDashboard directly
    if (typeof (window as any).buildDashboard === 'function') {
      (window as any).buildDashboard()
      return cleanup
    }

    // First load — load Chart.js from CDN, then leadership.js
    // onerror fallback ensures leadership.js loads even if CDN is blocked (chart section will be skipped)
    const loadScript = (src: string, onload?: () => void, onerror?: () => void) => {
      const existing = document.querySelector(`script[src="${src}"]`)
      if (existing) { onload?.(); return }
      const s = document.createElement('script')
      s.src = src
      s.onload = onload || null
      s.onerror = onerror || null
      document.head.appendChild(s)
    }

    const loadLeadershipJs = () => loadScript('/js/leadership.js')

    loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
      loadLeadershipJs,
      loadLeadershipJs
    )

    return cleanup
  }, [winsData, pipeData])

  const recordCount = winsData.length + pipeData.length

  return (
    <>
      <style>{`
        :root{--win:#16a34a;--win-l:#dcfce7;--win-bg:#f0fdf4;--win-border:#86efac;--pipe:#2563eb;--pipe-l:#dbeafe;--pipe-bg:#eff6ff;--pipe-border:#93c5fd;--risk:#dc2626;--risk-l:#fee2e2;--amber:#d97706;--amber-l:#fef3c7;--amber-border:#fcd34d;--dark:#1e293b;--slate:#334155;--muted:#64748b;--border:#e2e8f0;--bg:#f1f5f9;--card:#ffffff;--gap:20px;--c0:#3b82f6;--c1:#8b5cf6;--c2:#10b981;--c3:#f59e0b;--c4:#ec4899;--c5:#14b8a6;--c6:#6b7280;}
        .ld-wrap *{box-sizing:border-box;}
        .ld-wrap{font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;background:var(--bg);color:var(--dark);font-size:14px;line-height:1.5;margin:-24px;min-height:100vh;}
        .ld-topbar{background:linear-gradient(135deg,#1A3A5C 0%,#142d47 100%);color:white;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(0,0,0,.25);}
        .ld-topbar h1{font-size:1rem;font-weight:700;letter-spacing:-.3px;margin:0;}
        .ld-topbar h1 em{color:#93c5fd;font-style:normal;}
        .ld-topbar p{font-size:.6rem;color:rgba(255,255,255,.4);margin:2px 0 0;}
        .ld-topbar-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
        .period-row{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:5px 12px;}
        .period-row label{font-size:.6rem;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
        .period-input{background:transparent;border:none;color:white;font-size:.73rem;font-weight:600;outline:none;font-family:inherit;width:110px;}
        .period-input::-webkit-calendar-picker-indicator{filter:invert(1);opacity:.45;cursor:pointer;}
        .hdr-btn{padding:5px 12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:white;border-radius:7px;font-size:.72rem;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;white-space:nowrap;}
        .hdr-btn:hover{background:rgba(255,255,255,.18);}
        .hdr-gen{font-size:.6rem;color:rgba(255,255,255,.3);}
        .source-indicator{display:none;align-items:center;gap:6px;background:rgba(22,163,74,.15);border:1px solid rgba(22,163,74,.3);border-radius:7px;padding:4px 10px;font-size:.65rem;color:#86efac;font-weight:600;}
        .source-indicator.visible{display:flex;}
        .load-bar{background:var(--card);border-bottom:2px solid var(--border);}
        .load-bar-inner{max-width:1400px;margin:0 auto;padding:10px 28px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
        .lc{display:flex;align-items:center;gap:9px;border:2px dashed var(--border);border-radius:9px;padding:8px 14px;cursor:pointer;position:relative;transition:.15s;min-width:180px;flex:1;max-width:280px;}
        .lc.win-lc{border-color:var(--win-border);}
        .lc.pipe-lc{border-color:var(--pipe-border);}
        .lc.drag-over,.lc.loaded{border-style:solid;}
        .lc.win-lc.drag-over,.lc.win-lc.loaded{border-color:var(--win);background:var(--win-bg);}
        .lc.pipe-lc.drag-over,.lc.pipe-lc.loaded{border-color:var(--pipe);background:var(--pipe-bg);}
        .lc:hover{box-shadow:0 2px 8px rgba(0,0,0,.07);transform:translateY(-1px);}
        .lc input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
        .lc-icon{font-size:1.1rem;flex-shrink:0;}
        .lc-body{flex:1;min-width:0;}
        .lc-title{font-size:.72rem;font-weight:700;color:var(--dark);}
        .lc-status{font-size:.62rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .lc-status.ok-win{color:var(--win);font-weight:600;}
        .lc-status.ok-pipe{color:var(--pipe);font-weight:600;}
        .lb-msg{margin-left:auto;font-size:.7rem;color:var(--muted);white-space:nowrap;flex-shrink:0;}
        .lb-msg.ok{color:var(--win);font-weight:600;}
        .lb-msg.partial{color:var(--amber);font-weight:600;}
        .wrapper{max-width:1400px;margin:0 auto;padding:20px 28px;}
        .placeholder{text-align:center;padding:80px 24px;color:var(--muted);}
        .placeholder h2{font-size:1.2rem;font-weight:700;color:var(--dark);margin-bottom:8px;}
        .placeholder p{font-size:.85rem;}
        .section{background:var(--card);border-radius:12px;border:1px solid var(--border);margin-bottom:var(--gap);overflow:hidden;}
        .section-hdr{padding:16px 20px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);}
        .section-hdr-left{display:flex;align-items:center;gap:10px;}
        .section-icon{font-size:1.1rem;}
        .section-title{font-size:.95rem;font-weight:700;color:var(--dark);}
        .section-total{font-size:.95rem;font-weight:800;font-variant-numeric:tabular-nums;}
        .win-text{color:var(--win);}
        .pipe-text{color:var(--pipe);}
        .section-meta{font-size:.7rem;color:var(--muted);margin-top:1px;}
        .section-body{padding:16px 20px;}
        .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:var(--gap);}
        .kpi{background:var(--card);border-radius:10px;border:1px solid var(--border);padding:14px 18px;position:relative;overflow:hidden;}
        .kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;}
        .kpi.g::before{background:var(--win);}
        .kpi.b::before{background:var(--pipe);}
        .kpi.n::before{background:#94a3b8;}
        .kpi-label{font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:5px;}
        .kpi-val{font-size:1.4rem;font-weight:800;line-height:1;margin-bottom:3px;font-variant-numeric:tabular-nums;}
        .kpi.g .kpi-val{color:var(--win);}
        .kpi.b .kpi-val{color:var(--pipe);}
        .kpi.n .kpi-val{color:#475569;}
        .kpi-sub{font-size:.66rem;color:var(--muted);}
        .kpi-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:.62rem;font-weight:700;margin-top:4px;}
        .badge-g{background:var(--win-l);color:var(--win);}
        .badge-b{background:var(--pipe-l);color:var(--pipe);}
        .cat-summary{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}
        .cat-bar-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;background:#f8fafc;border:1px solid transparent;transition:.12s;}
        .cat-bar-row:hover{background:#f1f5f9;border-color:var(--border);}
        .cat-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
        .cat-bar-name{font-size:.76rem;font-weight:700;color:var(--dark);width:150px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cat-bar-track{flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;min-width:80px;}
        .cat-bar-fill{height:100%;border-radius:4px;transition:width .5s ease;}
        .cat-bar-rev{font-size:.78rem;font-weight:700;font-variant-numeric:tabular-nums;min-width:72px;text-align:right;}
        .cat-bar-cnt{font-size:.67rem;color:var(--muted);min-width:52px;text-align:right;}
        .cat-bar-gp{font-size:.64rem;color:var(--muted);min-width:40px;text-align:right;}
        .accordion{border-top:1px solid var(--border);}
        .acc-cat-row{border-bottom:1px solid var(--border);}
        .acc-cat-row:last-child{border-bottom:none;}
        .acc-trigger{display:flex;align-items:center;padding:10px 12px;cursor:pointer;user-select:none;gap:10px;transition:background .1s;}
        .acc-trigger:hover{background:#f8fafc;}
        .acc-cat-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .acc-cat-name{font-size:.8rem;font-weight:700;color:var(--dark);flex:1;min-width:0;}
        .acc-cat-barwrap{width:140px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;flex-shrink:0;}
        .acc-cat-fill{height:100%;border-radius:3px;}
        .acc-cat-total{font-size:.8rem;font-weight:700;font-variant-numeric:tabular-nums;min-width:78px;text-align:right;flex-shrink:0;}
        .acc-cat-count{font-size:.67rem;color:var(--muted);min-width:55px;text-align:right;flex-shrink:0;}
        .acc-arrow{font-size:.55rem;color:var(--muted);flex-shrink:0;transition:transform .2s;margin-left:4px;}
        .acc-arrow.open{transform:rotate(180deg);}
        .acc-body{display:none;border-top:1px solid #f1f5f9;}
        .acc-body.open{display:block;}
        .acc-cust-row{border-bottom:1px solid #f8fafc;}
        .acc-cust-row:last-child{border-bottom:none;}
        .acc-cust-trigger{display:flex;align-items:center;padding:8px 12px 8px 28px;cursor:pointer;user-select:none;gap:10px;transition:background .1s;background:#fafbfc;}
        .acc-cust-trigger:hover{background:#f1f5f9;}
        .acc-cust-name{font-size:.77rem;font-weight:600;color:var(--dark);flex:1;}
        .acc-cust-barwrap{width:100px;height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;flex-shrink:0;}
        .acc-cust-fill{height:100%;border-radius:3px;opacity:.6;}
        .acc-cust-total{font-size:.76rem;font-weight:700;font-variant-numeric:tabular-nums;min-width:72px;text-align:right;flex-shrink:0;}
        .acc-cust-cnt{font-size:.64rem;color:var(--muted);min-width:44px;text-align:right;flex-shrink:0;}
        .deal-table-wrap{padding:8px 12px 12px 44px;background:#f8fafc;}
        .deal-table{width:100%;border-collapse:collapse;font-size:.73rem;}
        .deal-table th{padding:5px 10px;text-align:left;font-size:.59rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap;}
        .deal-table th.r{text-align:right;}
        .deal-table td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
        .deal-table td.r{text-align:right;font-variant-numeric:tabular-nums;}
        .deal-table tr:last-child td{border-bottom:none;}
        .deal-table tr:hover td{background:#f1f5f9;}
        .deal-table tr.overdue td{background:#fff5f5;}
        .deal-table tr.overdue td.date-col{color:var(--risk);font-weight:700;}
        .deal-opp-name{font-weight:500;color:var(--dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;}
        .gp-chip{display:inline-flex;align-items:center;padding:1px 6px;border-radius:10px;font-size:.62rem;font-weight:700;white-space:nowrap;}
        .gp-h{background:var(--win-l);color:var(--win);}
        .gp-m{background:#fef3c7;color:#b45309;}
        .gp-l{background:#f1f5f9;color:var(--muted);}
        .stage-badge{font-size:.65rem;color:var(--muted);background:#f1f5f9;padding:1px 6px;border-radius:8px;white-space:nowrap;}
        .overdue-badge{background:var(--risk-l);color:var(--risk);font-size:.6rem;font-weight:700;padding:1px 5px;border-radius:6px;margin-left:4px;}
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);margin-bottom:var(--gap);}
        @media(max-width:900px){.two-col{grid-template-columns:1fr;}}
        .cust-list{display:flex;flex-direction:column;gap:7px;}
        .cust-row{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:7px;background:#f8fafc;}
        .cust-rank{font-size:.65rem;font-weight:700;color:var(--muted);width:18px;text-align:right;flex-shrink:0;}
        .cust-name{font-size:.77rem;font-weight:600;color:var(--dark);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .cust-bar-track{width:90px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;flex-shrink:0;}
        .cust-bar-fill{height:100%;border-radius:3px;}
        .cust-rev{font-size:.76rem;font-weight:700;font-variant-numeric:tabular-nums;min-width:68px;text-align:right;flex-shrink:0;}
        .cust-cnt{font-size:.62rem;color:var(--muted);min-width:28px;text-align:right;flex-shrink:0;}
        .chart-wrap{position:relative;}
        .key-deals-table{width:100%;border-collapse:collapse;}
        .key-deals-table th{padding:7px 12px;text-align:left;font-size:.59rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);background:#f8fafc;border-bottom:1px solid var(--border);white-space:nowrap;}
        .key-deals-table th.r{text-align:right;}
        .key-deals-table td{padding:8px 12px;border-bottom:1px solid var(--border);font-size:.76rem;vertical-align:middle;}
        .key-deals-table td.r{text-align:right;font-variant-numeric:tabular-nums;}
        .key-deals-table tr:last-child td{border-bottom:none;}
        .key-deals-table tr:hover td{background:#fafbfc;}
        .deal-num{font-size:.65rem;font-weight:700;color:var(--muted);width:22px;}
        .deal-co{font-weight:700;color:var(--dark);}
        .deal-opp{font-size:.67rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;}
        .risk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;}
        .risk-card{background:var(--card);border-radius:10px;border:1px solid var(--border);border-left:4px solid;padding:14px 16px;}
        .risk-card.high{border-left-color:var(--risk);background:#fffafa;}
        .risk-card.medium{border-left-color:var(--amber);background:#fffdf5;}
        .risk-card.info{border-left-color:var(--pipe);background:var(--pipe-bg);}
        .risk-card.good{border-left-color:var(--win);background:var(--win-bg);}
        .risk-title{font-size:.78rem;font-weight:700;color:var(--dark);margin-bottom:5px;}
        .risk-body{font-size:.72rem;color:var(--muted);line-height:1.5;}
        .partial-alert{background:var(--amber-l);border:1px solid var(--amber-border);border-radius:9px;padding:10px 16px;font-size:.77rem;color:#92400e;margin-bottom:var(--gap);display:flex;align-items:center;gap:8px;}
        .empty-state{text-align:center;padding:28px 16px;color:var(--muted);font-size:.78rem;font-style:italic;}
        @media(max-width:800px){.acc-cat-barwrap,.acc-cust-barwrap,.cust-bar-track{display:none;}}
      `}</style>

      <div className="ld-wrap">
        {/* Top bar */}
        <div className="ld-topbar">
          <div>
            <h1>ICT Services &nbsp;|&nbsp; <em>Sales Leadership Report</em></h1>
            <p>Live data from SalesLocker &mdash; {recordCount} records loaded &mdash; Wins &amp; Pipeline by Category and Customer</p>
          </div>
          <div className="ld-topbar-right">
            <div className="period-row">
              <label>Period</label>
              <input type="date" className="period-input" id="dateFrom"
                onChange={() => { if ((window as any).buildDashboard) (window as any).buildDashboard() }} />
              <span style={{color:'rgba(255,255,255,.3)'}}>→</span>
              <input type="date" className="period-input" id="dateTo"
                onChange={() => { if ((window as any).buildDashboard) (window as any).buildDashboard() }} />
            </div>
            <div className="source-indicator" id="sourceIndicator">
              ✓ Live from Supabase
            </div>
            <button className="hdr-btn" onClick={() => window.print()}>🖨 Print</button>
            <button className="hdr-btn" style={{display:'none'}} id="btnReset"
              onClick={() => { if ((window as any).resetAll) (window as any).resetAll() }}>↺ Clear</button>
            <span className="hdr-gen" id="genLabel"></span>
          </div>
        </div>

        {/* Manual CSV upload bar (hidden when Supabase data is loaded) */}
        <div className="load-bar" id="loadBarSection">
          <div className="load-bar-inner">
            <div className="lc win-lc" id="lcWins"
              onDragOver={(e) => { e.preventDefault(); document.getElementById('lcWins')?.classList.add('drag-over') }}
              onDragLeave={() => document.getElementById('lcWins')?.classList.remove('drag-over')}
              onDrop={(e) => { e.preventDefault(); document.getElementById('lcWins')?.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if(f && (window as any).readFile) (window as any).readFile(f,'wins') }}>
              <span className="lc-icon">🏆</span>
              <div className="lc-body">
                <div className="lc-title">Closed / Won</div>
                <div className="lc-status" id="lcWinsSub">Override: drop CSV to replace live data</div>
              </div>
              <input type="file" accept=".csv,.CSV"
                onChange={(e) => { const f = e.target.files?.[0]; if(f && (window as any).readFile) (window as any).readFile(f,'wins'); (e.target as HTMLInputElement).value = '' }} />
            </div>
            <div className="lc pipe-lc" id="lcPipe"
              onDragOver={(e) => { e.preventDefault(); document.getElementById('lcPipe')?.classList.add('drag-over') }}
              onDragLeave={() => document.getElementById('lcPipe')?.classList.remove('drag-over')}
              onDrop={(e) => { e.preventDefault(); document.getElementById('lcPipe')?.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if(f && (window as any).readFile) (window as any).readFile(f,'pipe') }}>
              <span className="lc-icon">📈</span>
              <div className="lc-body">
                <div className="lc-title">Active Pipeline</div>
                <div className="lc-status" id="lcPipeSub">Override: drop CSV to replace live data</div>
              </div>
              <input type="file" accept=".csv,.CSV"
                onChange={(e) => { const f = e.target.files?.[0]; if(f && (window as any).readFile) (window as any).readFile(f,'pipe'); (e.target as HTMLInputElement).value = '' }} />
            </div>
            <div className="lb-msg" id="lbMsg">Data loaded from SalesLocker — drop CSVs to override</div>
          </div>
        </div>

        {/* Dashboard content */}
        <div id="contentArea">
          <div className="wrapper">
            <div className="placeholder">
              <h2>Loading dashboard data...</h2>
              <p>Connecting to SalesLocker data. This should only take a moment.</p>
            </div>
          </div>
        </div>
        <footer style={{textAlign:'center', padding:'16px', color:'#94a3b8', fontSize:'12px', borderTop:'1px solid #e2e8f0', marginTop:'24px'}}>
          <span id="footerDate"></span>
        </footer>
      </div>
    </>
  )
}
