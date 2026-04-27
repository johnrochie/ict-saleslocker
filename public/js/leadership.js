/* =====================================================================
   ICT SalesLocker — Leadership Dashboard JS
   Auto-loads from Supabase via window.__LEADERSHIP_DATA__
   Falls back to CSV upload if data not present
===================================================================== */
let winsRaw = null, pipeRaw = null;
let winsData = [], pipeData = [];
let catChart = null;

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text[i] : null;
    if (c === '"') { if (inQ && text[i+1]==='"'){field+='"';i++;} else inQ=!inQ; }
    else if (c===',' && !inQ){ row.push(field); field=''; }
    else if ((c==='\n'||c==='\r'||c===null) && !inQ){
      row.push(field); field='';
      if (row.some(f=>f!=='')) rows.push(row);
      row=[];
      if (c==='\r' && text[i+1]==='\n') i++;
    } else if (c!==null){ field+=c; }
  }
  if (!rows.length) return [];
  const headers = rows[0].map(h=>h.trim().replace(/\r/g,''));
  return rows.slice(1)
    .filter(r=>r.length >= headers.length-2)
    .map(r=>{ const obj={}; headers.forEach((h,i)=>obj[h]=(r[i]||'').trim().replace(/\r/g,'')); return obj; });
}

function parseEuro(s){ if (!s) return 0; return parseFloat(s.replace(/[€,\s]/g,'')) || 0; }
function parsePct(s){ if (!s) return 0; return parseFloat(s.replace('%','')) || 0; }
function parseDate(s){
  if (!s) return null;
  const d = s.split(' ')[0].split('/');
  if (d.length!==3) return null;
  const dt = new Date(parseInt(d[2]), parseInt(d[1])-1, parseInt(d[0]));
  return isNaN(dt.getTime()) ? null : dt;
}
function fmtE(n){
  if (n===undefined||n===null||isNaN(n)) return '€0';
  if (Math.abs(n)>=1000000) return '€'+(n/1000000).toFixed(2)+'M';
  if (Math.abs(n)>=1000) return '€'+n.toLocaleString('en-IE',{maximumFractionDigits:0});
  return '€'+n.toFixed(0);
}
function fmtEFull(n){ return '€'+n.toLocaleString('en-IE',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtP(n){ return n.toFixed(1)+'%'; }
function fmtDate(s){ if (!s) return '—'; return s.split(' ')[0]; }
function isTestRow(d){ const co=(d.Company||'').toLowerCase().trim(); return co==='test'||co==='ict services'||co.startsWith('test '); }

const CAT_MAP = {
  'Hardware Sale (4006)':'Hardware Sale','Software Sale (4010)':'Software Sale',
  'Annual Maintenance (ICT)':'Annual Maintenance','Dedicated Resources (4003)':'Dedicated Resources',
  'Reseller Warranty (4014)':'Reseller Warranty','Managed Services- Account Mgmt':'Managed Services',
  'Managed Services Account Mgmt':'Managed Services','Managed Services':'Managed Services',
  'Storage & Logistics (4011)':'Storage & Logistics','Deployments & Projects (4004)':'Deployments & Projects',
  'Strategic Sales (4017)':'Strategic Sales','DOJ Tender Sales':'DOJ Tender Sales',
};
const CAT_COLORS = ['#3b82f6','#16a34a','#8b5cf6','#f59e0b','#ec4899','#14b8a6','#dc2626','#6b7280'];
let _catColorIdx = {};
function normCat(raw){ if (!raw) return 'Other'; const t=raw.trim(); if(CAT_MAP[t]) return CAT_MAP[t]; const stripped=t.replace(/\s*\(\d+\)\s*$/,'').trim(); return stripped||'Other'; }
function catColor(cat){ if(_catColorIdx[cat]===undefined){const idx=Object.keys(_catColorIdx).length%CAT_COLORS.length;_catColorIdx[cat]=idx;} return CAT_COLORS[_catColorIdx[cat]]; }
function stageNum(s){ if(!s) return 0; const m=s.match(/Stage\s*(\d)/i); return m?parseInt(m[1]):0; }
function shortStage(s){ if(!s) return '—'; const n=stageNum(s); return n?'S'+n:'—'; }
function gpCls(pct){ if(pct>=20) return 'gp-h'; if(pct>=8) return 'gp-m'; return 'gp-l'; }
function isOverdue(d){ const today=new Date(); today.setHours(0,0,0,0); const close=parseDate(d['Projected Close Date']); return close && close < today; }

function lcDragOver(e,id){ e.preventDefault(); document.getElementById(id).classList.add('drag-over'); }
function lcDragLeave(id){ document.getElementById(id).classList.remove('drag-over'); }
function lcDrop(e,type){ e.preventDefault(); const id=type==='wins'?'lcWins':'lcPipe'; document.getElementById(id).classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f) readFile(f,type); }
function lcSelect(e,type){ const f=e.target.files[0]; if(f) readFile(f,type); e.target.value=''; }

function readFile(file, type){
  const reader = new FileReader();
  reader.onload = function(e){
    const data = parseCSV(e.target.result);
    if (type==='wins'){ winsRaw=data; const sub=document.getElementById('lcWinsSub'); if(sub){sub.textContent='✓ '+data.length+' records'; sub.className='lc-status ok-win';} document.getElementById('lcWins')&&document.getElementById('lcWins').classList.add('loaded'); }
    else { pipeRaw=data; const sub=document.getElementById('lcPipeSub'); if(sub){sub.textContent='✓ '+data.length+' records'; sub.className='lc-status ok-pipe';} document.getElementById('lcPipe')&&document.getElementById('lcPipe').classList.add('loaded'); }
    updateLbMsg(); buildDashboard();
  };
  reader.readAsText(file,'UTF-8');
}

function updateLbMsg(){
  const el=document.getElementById('lbMsg'); if(!el) return;
  if(winsRaw&&pipeRaw){el.textContent='✓ Both files loaded'; el.className='lb-msg ok';}
  else if(winsRaw||pipeRaw){el.textContent='Now load the '+(winsRaw?'Active Pipeline':'Closed/Won')+' CSV'; el.className='lb-msg partial';}
  else{el.textContent='Load both CSV exports to populate the dashboard'; el.className='lb-msg';}
}

function getPeriod(){
  const fromVal=document.getElementById('dateFrom')&&document.getElementById('dateFrom').value;
  const toVal=document.getElementById('dateTo')&&document.getElementById('dateTo').value;
  const from=fromVal?new Date(fromVal):null;
  const to=toVal?new Date(toVal):null;
  if(to) to.setHours(23,59,59,999);
  return {from,to};
}
function inPeriod(dateStr,period){
  if(!period.from&&!period.to) return true;
  const d=parseDate(dateStr); if(!d) return true;
  if(period.from&&d<period.from) return false;
  if(period.to&&d>period.to) return false;
  return true;
}

function processData(){
  const period=getPeriod();
  winsData=(winsRaw||[]).filter(d=>{ if(isTestRow(d)) return false; return inPeriod(d['Closed Date'],period); });
  pipeData=(pipeRaw||[]).filter(d=>{ if(isTestRow(d)) return false; const status=(d.Status||'').toLowerCase().trim(); const sn=stageNum(d.Stage); if(!(status==='active'&&sn<5)) return false; return inPeriod(d['Create Date'],period); });
  _catColorIdx={};
  const allCats=[...new Set([...winsData,...pipeData].map(d=>normCat(d['Opportunity Category'])))].sort();
  allCats.forEach(c=>catColor(c));
}

function groupByCat(data){ const map={}; data.forEach(d=>{ const cat=normCat(d['Opportunity Category']); if(!map[cat]) map[cat]={total:0,gp:0,count:0,items:[]}; map[cat].total+=parseEuro(d['Revenue (Total)']); map[cat].gp+=parseEuro(d['Gross Profit']); map[cat].count++; map[cat].items.push(d); }); return map; }
function groupByCust(items){ const map={}; items.forEach(d=>{ const co=d.Company||'Unknown'; if(!map[co]) map[co]={total:0,gp:0,count:0,items:[]}; map[co].total+=parseEuro(d['Revenue (Total)']); map[co].gp+=parseEuro(d['Gross Profit']); map[co].count++; map[co].items.push(d); }); return map; }

function buildDashboard(){
  processData();
  const wTotal=winsData.reduce((s,d)=>s+parseEuro(d['Revenue (Total)']),0);
  const wGP=winsData.reduce((s,d)=>s+parseEuro(d['Gross Profit']),0);
  const wCount=winsData.length;
  const pTotal=pipeData.reduce((s,d)=>s+parseEuro(d['Revenue (Total)']),0);
  const pCount=pipeData.length;
  const wAvg=wCount?wTotal/wCount:0;
  const pAvg=pCount?pTotal/pCount:0;
  const winCats=groupByCat(winsData);
  const pipeCats=groupByCat(pipeData);
  let html='';
  if(!winsRaw||!pipeRaw){ const miss=!winsRaw?'Closed/Won':'Active Pipeline'; html+=`<div class="partial-alert">ℹ️ Partial view — load the <strong>${miss}</strong> CSV above for the complete dashboard.</div>`; }
  html+=buildKPIs(wTotal,wGP,wCount,pTotal,pCount,wAvg,pAvg);
  const _p=getPeriod();
  const _fmtD=d=>d?d.toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'}):null;
  const _periodLabel=(_p.from||_p.to)?' ('+ [_fmtD(_p.from),_fmtD(_p.to)].filter(Boolean).join(' → ')+')':'';
  if(winsRaw) html+=buildSection('wins','🏆','Wins This Period'+_periodLabel,wTotal,wCount,wGP,winCats);
  if(pipeRaw) html+=buildSection('pipe','📈','Active Pipeline'+_periodLabel,pTotal,pCount,null,pipeCats);
  if(winsRaw&&pipeRaw) html+=buildCatCompare();
  if(winsRaw||pipeRaw){ html+=`<div class="two-col">`; html+=buildCustomerConc(winCats,pipeCats); html+=`</div>`; }
  if(winsRaw||pipeRaw) html+=buildKeyDeals();
  if(pipeRaw) html+=buildRisks();
  const ca=document.getElementById('contentArea'); if(ca) ca.innerHTML=`<div class="wrapper">${html}</div>`;
  if(winsRaw&&pipeRaw) renderCatChart(winCats,pipeCats);
  const fd=document.getElementById('footerDate'); if(fd) fd.textContent='Generated '+new Date().toLocaleDateString('en-IE',{day:'2-digit',month:'long',year:'numeric'});
  const gl=document.getElementById('genLabel'); if(gl) gl.textContent='Updated '+new Date().toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
  const br=document.getElementById('btnReset'); if(br) br.style.display='';
}

function buildKPIs(wTotal,wGP,wCount,pTotal,pCount,wAvg,pAvg){
  const wGPpct=wTotal>0?wGP/wTotal*100:0;
  const cards=[
    {cls:'g',label:'Total Won',val:winsRaw?fmtE(wTotal):'—',sub:winsRaw?wCount+' deals closed':'Not loaded',badge:winsRaw&&wCount?`<span class="kpi-badge badge-g">GP ${fmtP(wGPpct)}</span>`:''},
    {cls:'g',label:'GP on Wins',val:winsRaw?fmtE(wGP):'—',sub:winsRaw?fmtP(wGPpct)+' margin':'Not loaded',badge:''},
    {cls:'b',label:'Active Pipeline',val:pipeRaw?fmtE(pTotal):'—',sub:pipeRaw?pCount+' open deals':'Not loaded',badge:pipeRaw&&pCount?`<span class="kpi-badge badge-b">${pCount} opps</span>`:''},
    {cls:'n',label:'Avg Won Deal',val:winsRaw&&wCount?fmtE(wAvg):'—',sub:'Per closed deal',badge:''},
    {cls:'n',label:'Avg Open Deal',val:pipeRaw&&pCount?fmtE(pAvg):'—',sub:'Per active opportunity',badge:''},
    {cls:'n',label:'Win / Pipeline',val:(winsRaw&&pipeRaw&&(wTotal+pTotal)>0)?fmtP(wTotal/(wTotal+pTotal)*100):'—',sub:'Won as % of Won+Pipe',badge:''},
  ];
  return `<div class="kpi-grid">${cards.map(c=>`<div class="kpi ${c.cls}"><div class="kpi-label">${c.label}</div><div class="kpi-val">${c.val}</div><div class="kpi-sub">${c.sub}</div>${c.badge}</div>`).join('')}</div>`;
}

function buildSection(type,icon,title,total,count,gp,catGroups){
  const isWins=type==='wins';
  const colorClass=isWins?'win-text':'pipe-text';
  const gpText=gp!==null&&total>0?` &nbsp;<span style="font-size:.72rem;font-weight:600;color:var(--muted);">GP ${fmtE(gp)} (${fmtP(gp/total*100)})</span>`:'';
  const catsSorted=Object.entries(catGroups).sort((a,b)=>b[1].total-a[1].total);
  const maxCatTotal=catsSorted[0]?.[1]?.total||1;
  const sumBars=catsSorted.map(([cat,g])=>{ const pct=Math.round(g.total/maxCatTotal*100); const gpPct=g.total>0?g.gp/g.total*100:0; return `<div class="cat-bar-row"><div class="cat-dot" style="background:${catColor(cat)}"></div><div class="cat-bar-name" title="${cat}">${cat}</div><div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${catColor(cat)}"></div></div><div class="cat-bar-rev ${colorClass}">${fmtE(g.total)}</div><div class="cat-bar-cnt">${g.count} deal${g.count!==1?'s':''}</div>${isWins?`<div class="cat-bar-gp"><span class="gp-chip ${gpCls(gpPct)}">${fmtP(gpPct)}</span></div>`:''}</div>`; }).join('');
  const acc=catsSorted.map(([cat,catG],ci)=>{ const custGroups=groupByCust(catG.items); const custSorted=Object.entries(custGroups).sort((a,b)=>b[1].total-a[1].total); const maxCustTotal=custSorted[0]?.[1]?.total||1; const catFill=Math.round(catG.total/maxCatTotal*100); const catId=`${type}-cat-${ci}`;
    const custRows=custSorted.map(([cust,custG],cj)=>{ const custId=`${type}-c${ci}-${cj}`; const custFill=Math.round(custG.total/maxCustTotal*100); const deals=[...custG.items].sort((a,b)=>parseEuro(b['Revenue (Total)'])-parseEuro(a['Revenue (Total)']));
      const dealRows=deals.map(d=>{ const rev=parseEuro(d['Revenue (Total)']); const gpPct=parsePct(d['Gross Profit Percentage']); const od=!isWins&&isOverdue(d); if(isWins) return `<tr><td><div class="deal-opp-name" title="${d.Opportunity||''}">${d.Opportunity||'—'}</div></td><td class="r">${fmtEFull(rev)}</td><td class="r"><span class="gp-chip ${gpCls(gpPct)}">${fmtP(gpPct)}</span></td><td><span class="stage-badge">${shortStage(d.Stage)}</span></td><td class="r">${fmtDate(d['Closed Date'])}</td></tr>`; else return `<tr${od?' class="overdue"':''}><td><div class="deal-opp-name" title="${d.Opportunity||''}">${d.Opportunity||'—'}${od?'<span class="overdue-badge">OVERDUE</span>':''}</div></td><td class="r">${fmtEFull(rev)}</td><td class="r"><span class="gp-chip ${gpCls(gpPct)}">${fmtP(gpPct)}</span></td><td><span class="stage-badge">${shortStage(d.Stage)}</span></td><td class="r${od?' date-col':''}">${fmtDate(d['Projected Close Date'])}</td><td class="r">${d['Age (in days)']||'0'}d</td></tr>`; }).join('');
      const dealHead=isWins?`<tr><th>Opportunity</th><th class="r">Revenue</th><th class="r">GP%</th><th>Stage</th><th class="r">Closed</th></tr>`:`<tr><th>Opportunity</th><th class="r">Revenue</th><th class="r">GP%</th><th>Stage</th><th class="r">Close By</th><th class="r">Age</th></tr>`;
      return `<div class="acc-cust-row"><div class="acc-cust-trigger" onclick="toggle('${custId}-b','${custId}-a')"><div class="acc-cust-name">${cust}</div><div class="acc-cust-barwrap"><div class="acc-cust-fill" style="width:${custFill}%;background:${catColor(cat)}"></div></div><div class="acc-cust-total">${fmtE(custG.total)}</div><div class="acc-cust-cnt">${custG.count}d</div><div class="acc-arrow" id="${custId}-a">▼</div></div><div class="acc-body" id="${custId}-b"><div class="deal-table-wrap"><table class="deal-table"><thead>${dealHead}</thead><tbody>${dealRows}</tbody></table></div></div></div>`; }).join('');
    return `<div class="acc-cat-row"><div class="acc-trigger" onclick="toggle('${catId}-b','${catId}-a')"><div class="acc-cat-dot" style="background:${catColor(cat)}"></div><div class="acc-cat-name">${cat}</div><div class="acc-cat-barwrap"><div class="acc-cat-fill" style="width:${catFill}%;background:${catColor(cat)}40;border-right:3px solid ${catColor(cat)}"></div></div><div class="acc-cat-total ${colorClass}">${fmtE(catG.total)}</div><div class="acc-cat-count">${catG.count} deal${catG.count!==1?'s':''}</div><div class="acc-arrow" id="${catId}-a">▼</div></div><div class="acc-body" id="${catId}-b">${custRows}</div></div>`; }).join('');
  return `<div class="section"><div class="section-hdr"><div class="section-hdr-left"><span class="section-icon">${icon}</span><div><div class="section-title">${title}</div><div class="section-meta">${count} deal${count!==1?'s':''} &nbsp;·&nbsp; ${catsSorted.length} categor${catsSorted.length!==1?'ies':'y'}</div></div></div><div><div class="section-total ${colorClass}">${fmtE(total)}${gpText}</div></div></div><div class="section-body"><div class="cat-summary">${sumBars}</div><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px;">Click a category or customer to expand deals &nbsp;▼</div></div><div class="accordion">${acc}</div></div>`;
}

function toggle(bodyId,arrowId){ const body=document.getElementById(bodyId); const arrow=document.getElementById(arrowId); if(!body) return; const open=body.classList.contains('open'); body.classList.toggle('open',!open); if(arrow) arrow.classList.toggle('open',!open); }

function buildCatCompare(){ return `<div class="section"><div class="section-hdr"><div class="section-hdr-left"><span class="section-icon">📊</span><div><div class="section-title">Category Comparison — Wins vs Pipeline</div><div class="section-meta">Where revenue has landed vs where future value sits</div></div></div></div><div class="section-body"><div class="chart-wrap" style="height:260px;"><canvas id="catChart"></canvas></div></div></div>`; }

function renderCatChart(winCats,pipeCats){
  const allCats=[...new Set([...Object.keys(winCats),...Object.keys(pipeCats)])].sort((a,b)=>{ const tA=(winCats[a]?.total||0)+(pipeCats[a]?.total||0); const tB=(winCats[b]?.total||0)+(pipeCats[b]?.total||0); return tB-tA; });
  const el=document.getElementById('catChart'); if(!el) return;
  if(catChart) catChart.destroy();
  catChart=new Chart(el.getContext('2d'),{type:'bar',data:{labels:allCats,datasets:[{label:'Won',data:allCats.map(c=>Math.round(winCats[c]?.total||0)),backgroundColor:'rgba(22,163,74,.8)',borderRadius:4},{label:'Active Pipeline',data:allCats.map(c=>Math.round(pipeCats[c]?.total||0)),backgroundColor:'rgba(37,99,235,.7)',borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:14}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmtEFull(ctx.parsed.x)}`}}},scales:{x:{grid:{color:'#f1f5f9'},ticks:{font:{size:10},callback:v=>'€'+(v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'k':v)}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
}

function buildCustomerConc(winCats,pipeCats){
  const winByCust={},pipeByCust={};
  winsData.forEach(d=>{ const co=d.Company||'Unknown'; if(!winByCust[co])winByCust[co]={rev:0,count:0}; winByCust[co].rev+=parseEuro(d['Revenue (Total)']); winByCust[co].count++; });
  pipeData.forEach(d=>{ const co=d.Company||'Unknown'; if(!pipeByCust[co])pipeByCust[co]={rev:0,count:0}; pipeByCust[co].rev+=parseEuro(d['Revenue (Total)']); pipeByCust[co].count++; });
  const topWin=[...Object.entries(winByCust)].sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);
  const topPipe=[...Object.entries(pipeByCust)].sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);
  const maxW=topWin[0]?.[1]?.rev||1; const maxP=topPipe[0]?.[1]?.rev||1;
  function custList(arr,max,colorClass,colorHex){ if(!arr.length) return '<div class="empty-state">No data</div>'; return `<div class="cust-list">${arr.map(([name,v],i)=>`<div class="cust-row"><div class="cust-rank">${i+1}</div><div class="cust-name" title="${name}">${name}</div><div class="cust-bar-track"><div class="cust-bar-fill" style="width:${Math.round(v.rev/max*100)}%;background:${colorHex}"></div></div><div class="cust-rev ${colorClass}">${fmtE(v.rev)}</div><div class="cust-cnt">${v.count}d</div></div>`).join('')}</div>`; }
  return `<div class="section" style="margin-bottom:0"><div class="section-hdr"><div class="section-hdr-left"><span class="section-icon">🏢</span><div><div class="section-title">Top Customers — Wins</div><div class="section-meta">Who drove revenue this period</div></div></div><div class="section-total win-text">${winsRaw?Object.keys(winByCust).length+' customers':'—'}</div></div><div class="section-body">${winsRaw?custList(topWin,maxW,'win-text','rgba(22,163,74,.7)'):'<div class="empty-state">Load wins CSV</div>'}</div></div><div class="section" style="margin-bottom:0"><div class="section-hdr"><div class="section-hdr-left"><span class="section-icon">🏢</span><div><div class="section-title">Top Customers — Pipeline</div><div class="section-meta">Who matters most in the next cycle</div></div></div><div class="section-total pipe-text">${pipeRaw?Object.keys(pipeByCust).length+' customers':'—'}</div></div><div class="section-body">${pipeRaw?custList(topPipe,maxP,'pipe-text','rgba(37,99,235,.6)'):'<div class="empty-state">Load pipeline CSV</div>'}</div></div>`;
}

function buildKeyDeals(){
  const topWins=[...winsData].sort((a,b)=>parseEuro(b['Revenue (Total)'])-parseEuro(a['Revenue (Total)'])).slice(0,10);
  const topPipe=[...pipeData].sort((a,b)=>parseEuro(b['Revenue (Total)'])-parseEuro(a['Revenue (Total)'])).slice(0,10);
  function dealTable(data,type){ if(!data.length) return '<div class="empty-state">No data</div>'; const isWins=type==='wins'; const rows=data.map((d,i)=>{ const rev=parseEuro(d['Revenue (Total)']); const gpPct=parsePct(d['Gross Profit Percentage']); const od=!isWins&&isOverdue(d); return `<tr${od?' class="overdue"':''}><td><div class="deal-num">${i+1}</div></td><td><div class="deal-co">${d.Company||'—'}</div><div class="deal-opp" title="${d.Opportunity||''}">${d.Opportunity||'—'}</div></td><td style="font-size:.68rem;">${normCat(d['Opportunity Category'])}</td><td class="r"><strong>${fmtE(rev)}</strong></td><td class="r"><span class="gp-chip ${gpCls(gpPct)}">${fmtP(gpPct)}</span></td>${isWins?`<td class="r" style="font-size:.68rem;">${fmtDate(d['Closed Date'])}</td>`:`<td class="r${od?' date-col':''}" style="font-size:.68rem;">${fmtDate(d['Projected Close Date'])}${od?'<span class="overdue-badge">OD</span>':''}</td>`}</tr>`; }).join(''); const lastHdr=isWins?'Closed':'Close By'; return `<div style="overflow-x:auto;"><table class="key-deals-table"><thead><tr><th>#</th><th>Customer / Opportunity</th><th>Category</th><th class="r">Revenue</th><th class="r">GP%</th><th class="r">${lastHdr}</th></tr></thead><tbody>${rows}</tbody></table></div>`; }
  return `<div class="two-col"><div class="section" style="margin-bottom:0"><div class="section-hdr"><div class="section-hdr-left"><span class="section-icon">🏆</span><div><div class="section-title">Top 10 Won Deals</div><div class="section-meta">Largest wins in period</div></div></div></div><div>${winsRaw?dealTable(topWins,'wins'):'<div class="section-body empty-state">Load wins CSV</div>'}</div></div><div class="section" style="margin-bottom:0"><div class="section-hdr"><div class="section-hdr-left"><span class="section-icon">📌</span><div><div class="section-title">Top 10 Open Deals</div><div class="section-meta">Largest active opportunities</div></div></div></div><div>${pipeRaw?dealTable(topPipe,'pipe'):'<div class="section-body empty-state">Load pipeline CSV</div>'}</div></div></div>`;
}

function buildRisks(){
  const today=new Date(); today.setHours(0,0,0,0); const risks=[];
  const overdue=pipeData.filter(d=>{ const c=parseDate(d['Projected Close Date']); return c&&c<today; }).sort((a,b)=>parseEuro(b['Revenue (Total)'])-parseEuro(a['Revenue (Total)']));
  if(overdue.length){ const totOD=overdue.reduce((s,d)=>s+parseEuro(d['Revenue (Total)']),0); const preview=overdue.slice(0,3).map(d=>`${d.Company} (${fmtE(parseEuro(d['Revenue (Total)']))})`).join(', '); risks.push({level:'high',title:`${overdue.length} Overdue Active Deal${overdue.length>1?'s':''}`,body:`${fmtE(totOD)} past projected close date. ${preview}${overdue.length>3?' and '+(overdue.length-3)+' more.':''}`}); }
  const aged=pipeData.filter(d=>parseInt(d['Age (in days)']||0)>60).sort((a,b)=>parseInt(b['Age (in days)']||0)-parseInt(a['Age (in days)']||0));
  if(aged.length){ const preview=aged.slice(0,3).map(d=>`${d.Company}: ${d['Age (in days)']}d`).join(', '); risks.push({level:'medium',title:`${aged.length} Long-running Deal${aged.length>1?'s':''} (60+ days open)`,body:`${preview}${aged.length>3?', and '+(aged.length-3)+' more':''}`}); }
  const closing=pipeData.filter(d=>{ const c=parseDate(d['Projected Close Date']); if(!c) return false; const days=Math.round((c-today)/(864e5)); return days>=0&&days<=21&&parseEuro(d['Revenue (Total)'])>=20000; }).sort((a,b)=>parseEuro(b['Revenue (Total)'])-parseEuro(a['Revenue (Total)']));
  if(closing.length){ const preview=closing.slice(0,3).map(d=>`${d.Company}: ${fmtE(parseEuro(d['Revenue (Total)']))} by ${fmtDate(d['Projected Close Date'])}`).join(' · '); risks.push({level:'info',title:`${closing.length} High-Value Deal${closing.length>1?'s':''} Closing Within 21 Days`,body:preview+(closing.length>3?' and '+(closing.length-3)+' more.':'')}); }
  const byCust={}; pipeData.forEach(d=>{const co=d.Company||'Unknown';if(!byCust[co])byCust[co]=0;byCust[co]+=parseEuro(d['Revenue (Total)']);}); const pTot=pipeData.reduce((s,d)=>s+parseEuro(d['Revenue (Total)']),0); const top=Object.entries(byCust).sort((a,b)=>b[1]-a[1])[0];
  if(top&&pTot>0&&top[1]/pTot>0.35) risks.push({level:'medium',title:`Concentration Risk: ${top[0]}`,body:`${top[0]} represents ${fmtP(top[1]/pTot*100)} of total active pipeline (${fmtE(top[1])}). High dependency on a single customer.`});
  const byCat={}; pipeData.forEach(d=>{const c=normCat(d['Opportunity Category']);if(!byCat[c])byCat[c]=0;byCat[c]+=parseEuro(d['Revenue (Total)']);}); const topCat=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  if(topCat&&pTot>0&&topCat[1]/pTot>0.8) risks.push({level:'medium',title:`Category Concentration: ${topCat[0]}`,body:`${fmtP(topCat[1]/pTot*100)} of pipeline is ${topCat[0]}. Limited category diversification.`});
  if(!risks.length) risks.push({level:'good',title:'No significant risks identified',body:'Active pipeline is within normal parameters. No overdue, aged, or highly concentrated items flagged.'});
  return `<div class="section"><div class="section-hdr"><div class="section-hdr-left"><span class="section-icon">⚠️</span><div><div class="section-title">Risks &amp; Attention Areas</div><div class="section-meta">Items requiring leadership awareness</div></div></div></div><div class="section-body"><div class="risk-grid">${risks.map(r=>`<div class="risk-card ${r.level}"><div class="risk-title">${r.title}</div><div class="risk-body">${r.body}</div></div>`).join('')}</div></div></div>`;
}

function resetAll(){
  winsRaw=null; pipeRaw=null; winsData=[]; pipeData=[];
  if(catChart){catChart.destroy();catChart=null;} _catColorIdx={};
  ['lcWins','lcPipe'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove('loaded','drag-over'); });
  const ws=document.getElementById('lcWinsSub'); if(ws){ws.textContent='Drop CSV or click to browse';ws.className='lc-status';}
  const ps=document.getElementById('lcPipeSub'); if(ps){ps.textContent='Drop CSV or click to browse';ps.className='lc-status';}
  updateLbMsg();
  const ca=document.getElementById('contentArea'); if(ca) ca.innerHTML=`<div class="wrapper"><div class="placeholder"><h2>Drop your CRM exports into the bar above</h2><p>Load the Closed/Won CSV and the Active Pipeline CSV.</p></div></div>`;
  const br=document.getElementById('btnReset'); if(br) br.style.display='none';
  const gl=document.getElementById('genLabel'); if(gl) gl.textContent='';
}

/* Auto-init: use Supabase data if available, otherwise set up date defaults */
(function(){
  const today=new Date();
  const from=new Date(); from.setDate(today.getDate()-90);
  const df=document.getElementById('dateFrom'); if(df) df.value=from.toISOString().slice(0,10);
  const dt=document.getElementById('dateTo'); if(dt) dt.value=today.toISOString().slice(0,10);
  const fd=document.getElementById('footerDate'); if(fd) fd.textContent=today.toLocaleDateString('en-IE',{day:'2-digit',month:'long',year:'numeric'});

  /* If Supabase data was injected, use it */
  if(window.__LEADERSHIP_DATA__){
    winsRaw=window.__LEADERSHIP_DATA__.wins;
    pipeRaw=window.__LEADERSHIP_DATA__.pipe;
    /* Hide manual upload bar */
    const lb=document.getElementById('loadBarSection'); if(lb) lb.style.display='none';
    const si=document.getElementById('sourceIndicator'); if(si) si.style.display='flex';
    buildDashboard();
  }
})();
