// Contabilidad OPEX / CAPEX por proyecto, con importación y exportación a Excel (.xlsx).
import { app, openModal, closeModal, toast, confirmDialog } from '../app.js';
import { icon, esc, uid, today, fmtDate, fmtMoney, options, pickFile, loadXLSX, toISODate } from '../utils.js';

export const CATEGORIES = {
  OPEX: ['Mano de obra', 'Renta de maquinaria y equipo', 'Materiales consumibles', 'Servicios y subcontratos', 'Mantenimiento', 'Fletes y acarreos', 'Viáticos', 'Gastos administrativos', 'Seguros y fianzas', 'Otros OPEX'],
  CAPEX: ['Maquinaria y equipo', 'Obra civil / construcción', 'Instalaciones', 'Terrenos', 'Vehículos', 'Tecnología', 'Mobiliario', 'Otros CAPEX']
};
const STATUSES = ['Comprometido', 'Pagado'];

let filterProject = '';
let filterType = '';
let lastParam;

export function render(el, [pidParam]) {
  // Solo aplicar el proyecto de la URL cuando cambia (p. ej. al venir desde la ficha del proyecto).
  if (pidParam !== lastParam) { lastParam = pidParam; if (pidParam && app.project(pidParam)) filterProject = pidParam; }
  const rows = app.state.finance
    .filter(r => (!filterProject || r.projectId === filterProject) && (!filterType || r.type === filterType))
    .sort((a, b) => b.date.localeCompare(a.date));
  const projects = filterProject ? [app.project(filterProject)] : app.state.projects;

  el.innerHTML = `
    <div class="page-head">
      <h1>Finanzas · OPEX y CAPEX</h1>
      <div class="toolbar">
        <button class="btn" data-template>${icon('doc')} Plantilla</button>
        <button class="btn" data-import>${icon('upload')} Importar</button>
        <button class="btn" data-export>${icon('download')} Exportar</button>
        <button class="btn primary" data-new>${icon('plus')} Movimiento</button>
      </div>
    </div>
    <div class="toolbar" style="margin-bottom:14px">
      <select data-fp style="width:auto">${app.projectOptions(filterProject).replace('— Sin proyecto —', 'Todos los proyectos')}</select>
      <select data-ft style="width:auto"><option value="">OPEX + CAPEX</option>${options([{ v: 'OPEX', label: 'Solo OPEX' }, { v: 'CAPEX', label: 'Solo CAPEX' }], filterType)}</select>
    </div>
    ${summaryCards(projects)}
    ${projects.length > 1 ? projectTable(projects) : ''}
    ${categoryTable(rows)}
    <div class="card">
      <h2>Movimientos <span class="muted small">(${rows.length})</span></h2>
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Proyecto</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Proveedor</th><th>Estatus</th><th class="num">Monto</th></tr></thead>
        <tbody>${rows.map(r => `<tr data-row="${r.id}" style="cursor:pointer">
          <td>${fmtDate(r.date)}</td><td>${esc(app.projectName(r.projectId))}</td>
          <td><span class="chip ${r.type === 'CAPEX' ? 'warn' : ''}">${r.type}</span></td>
          <td>${esc(r.category)}</td><td>${esc(r.concept)}</td><td>${esc(r.supplier)}</td>
          <td><span class="chip ${r.status === 'Pagado' ? 'ok' : ''}">${esc(r.status)}</span></td>
          <td class="num">${fmtMoney(r.amount)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Sin movimientos. Agrega uno o importa tu Excel.</div>'}
    </div>`;

  el.querySelector('[data-fp]').onchange = e => { filterProject = e.target.value; lastParam = filterProject || undefined; app.go(filterProject ? `finanzas/${filterProject}` : 'finanzas'); };
  el.querySelector('[data-ft]').onchange = e => { filterType = e.target.value; app.commit(); };
  el.querySelector('[data-new]').onclick = () => entryForm(null);
  el.querySelectorAll('[data-row]').forEach(tr => tr.onclick = () => entryForm(app.state.finance.find(r => r.id === tr.dataset.row)));
  el.querySelector('[data-export]').onclick = () => exportExcel(projects).catch(e => toast(e.message));
  el.querySelector('[data-import]').onclick = () => importExcel().catch(e => toast(e.message));
  el.querySelector('[data-template]').onclick = () => exportTemplate().catch(e => toast(e.message));
}

function totals(projectIds, type) {
  const rows = app.state.finance.filter(r => projectIds.includes(r.projectId) && r.type === type);
  const paid = rows.filter(r => r.status === 'Pagado').reduce((a, r) => a + r.amount, 0);
  const committed = rows.filter(r => r.status !== 'Pagado').reduce((a, r) => a + r.amount, 0);
  const budget = projectIds.reduce((a, id) => a + (Number(app.project(id)?.[type === 'OPEX' ? 'budgetOpex' : 'budgetCapex']) || 0), 0);
  return { budget, paid, committed, available: budget - paid - committed, pct: budget ? ((paid + committed) / budget) * 100 : 0 };
}

function summaryCards(projects) {
  const ids = projects.map(p => p.id);
  return `<div class="grid grid-2" style="margin-bottom:14px">${['OPEX', 'CAPEX'].filter(t => !filterType || t === filterType).map(type => {
    const t = totals(ids, type);
    const color = t.pct > 100 ? 'var(--bad)' : t.pct > 85 ? 'var(--warn)' : 'var(--ok)';
    return `<div class="card">
      <div style="display:flex;justify-content:space-between"><h2>${type}</h2><span class="muted small">${type === 'OPEX' ? 'Gasto operativo' : 'Inversión de capital'}</span></div>
      <div class="grid grid-4" style="grid-template-columns:repeat(2,1fr);gap:8px">
        <div class="stat"><div class="l">Presupuesto</div><div class="v">${fmtMoney(t.budget)}</div></div>
        <div class="stat"><div class="l">Disponible</div><div class="v" style="color:${t.available < 0 ? 'var(--bad)' : 'inherit'}">${fmtMoney(t.available)}</div></div>
        <div class="stat"><div class="l">Pagado</div><div class="v" style="font-size:1.1rem">${fmtMoney(t.paid)}</div></div>
        <div class="stat"><div class="l">Comprometido</div><div class="v" style="font-size:1.1rem">${fmtMoney(t.committed)}</div></div>
      </div>
      <div class="small" style="margin:10px 0 4px">Ejercido ${t.pct.toFixed(1)}% del presupuesto</div>
      <div class="progress"><div style="width:${Math.min(100, t.pct)}%;background:${color}"></div></div>
    </div>`;
  }).join('')}</div>`;
}

function projectTable(projects) {
  return `<div class="card"><h2>Por proyecto</h2><div class="table-wrap"><table>
    <thead><tr><th>Proyecto</th><th class="num">Ppto. OPEX</th><th class="num">Ejercido OPEX</th><th class="num">%</th>
      <th class="num">Ppto. CAPEX</th><th class="num">Ejercido CAPEX</th><th class="num">%</th></tr></thead>
    <tbody>${projects.map(p => {
      const o = totals([p.id], 'OPEX'), c = totals([p.id], 'CAPEX');
      const pc = v => `<span style="color:${v > 100 ? 'var(--bad)' : 'inherit'}">${v.toFixed(0)}%</span>`;
      return `<tr><td><a href="#finanzas/${p.id}">${esc(p.name)}</a></td>
        <td class="num">${fmtMoney(o.budget)}</td><td class="num">${fmtMoney(o.paid + o.committed)}</td><td class="num">${pc(o.pct)}</td>
        <td class="num">${fmtMoney(c.budget)}</td><td class="num">${fmtMoney(c.paid + c.committed)}</td><td class="num">${pc(c.pct)}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
}

function categoryTable(rows) {
  if (!rows.length) return '';
  const map = {};
  for (const r of rows) {
    const k = r.type + '|' + r.category;
    map[k] ??= { type: r.type, category: r.category, paid: 0, committed: 0 };
    map[k][r.status === 'Pagado' ? 'paid' : 'committed'] += r.amount;
  }
  const list = Object.values(map).sort((a, b) => a.type.localeCompare(b.type) || (b.paid + b.committed) - (a.paid + a.committed));
  const total = list.reduce((a, x) => a + x.paid + x.committed, 0);
  return `<div class="card"><h2>Por categoría</h2><div class="table-wrap"><table>
    <thead><tr><th>Tipo</th><th>Categoría</th><th class="num">Pagado</th><th class="num">Comprometido</th><th class="num">Total</th><th class="num">% del total</th></tr></thead>
    <tbody>${list.map(x => `<tr><td>${x.type}</td><td>${esc(x.category)}</td><td class="num">${fmtMoney(x.paid)}</td>
      <td class="num">${fmtMoney(x.committed)}</td><td class="num"><b>${fmtMoney(x.paid + x.committed)}</b></td>
      <td class="num">${total ? (((x.paid + x.committed) / total) * 100).toFixed(1) : 0}%</td></tr>`).join('')}</tbody></table></div></div>`;
}

function entryForm(entry) {
  const r = entry || { date: today(), type: filterType || 'OPEX', projectId: filterProject, status: 'Pagado' };
  const catOptions = (type, sel) => options(CATEGORIES[type].map(v => ({ v, label: v })), sel);
  openModal(entry ? 'Editar movimiento' : 'Nuevo movimiento', `
    <div class="row">
      <label>Fecha<input type="date" name="date" value="${esc(r.date)}"></label>
      <label>Proyecto<select name="projectId" required>${app.projectOptions(r.projectId)}</select></label>
    </div>
    <div class="row">
      <label>Tipo<select name="type" data-type>${options([{ v: 'OPEX', label: 'OPEX – gasto operativo' }, { v: 'CAPEX', label: 'CAPEX – inversión' }], r.type)}</select></label>
      <label>Categoría<select name="category" data-cat>${catOptions(r.type, r.category)}</select></label>
    </div>
    <label>Concepto<input name="concept" required value="${esc(r.concept)}"></label>
    <div class="row">
      <label>Proveedor<input name="supplier" value="${esc(r.supplier)}"></label>
      <label>Factura / OC<input name="invoice" value="${esc(r.invoice)}"></label>
    </div>
    <div class="row">
      <label>Monto (MXN)<input type="number" step="0.01" name="amount" required value="${esc(r.amount)}"></label>
      <label>Estatus<select name="status">${options(STATUSES.map(v => ({ v, label: v })), r.status)}</select></label>
    </div>`, {
    extraFooter: entry ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Eliminar</button>' : '',
    onOpen: f => {
      f.querySelector('[data-type]').onchange = e => { f.querySelector('[data-cat]').innerHTML = catOptions(e.target.value); };
      f.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirmDialog('¿Eliminar este movimiento?')) return;
        app.state.finance = app.state.finance.filter(x => x.id !== entry.id); closeModal(); app.commit();
      });
    },
    onSubmit: d => {
      if (!d.projectId) { toast('Selecciona un proyecto'); return false; }
      if (!d.concept.trim() || !d.amount) { toast('Concepto y monto son obligatorios'); return false; }
      const data = { ...d, amount: Number(d.amount) };
      if (entry) Object.assign(entry, data); else app.state.finance.push({ id: uid(), ...data });
      app.commit(); toast('Movimiento guardado');
    }
  });
}

// ---------- Excel ----------
const HEADERS = ['Fecha', 'Proyecto', 'Tipo', 'Categoría', 'Concepto', 'Proveedor', 'Factura/OC', 'Monto', 'Estatus'];
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function exportExcel(projects) {
  const XLSX = await loadXLSX();
  const ids = projects.map(p => p.id);
  const rows = app.state.finance.filter(r => ids.includes(r.projectId)).sort((a, b) => a.date.localeCompare(b.date));
  const wb = XLSX.utils.book_new();
  const mov = XLSX.utils.aoa_to_sheet([HEADERS, ...rows.map(r => [new Date(r.date + 'T12:00'), app.projectName(r.projectId), r.type, r.category, r.concept, r.supplier || '', r.invoice || '', r.amount, r.status])], { cellDates: true });
  mov['!cols'] = [12, 28, 8, 26, 36, 22, 14, 14, 13].map(w => ({ wch: w }));
  setFormats(XLSX, mov, 'H', '"$"#,##0.00'); setFormats(XLSX, mov, 'A', 'dd/mm/yyyy');
  mov['!autofilter'] = { ref: mov['!ref'] };
  XLSX.utils.book_append_sheet(wb, mov, 'Movimientos');

  const res = [['Proyecto', 'Tipo', 'Presupuesto', 'Pagado', 'Comprometido', 'Disponible', '% Ejercido']];
  for (const p of projects) for (const type of ['OPEX', 'CAPEX']) {
    const t = totals([p.id], type);
    res.push([p.name, type, t.budget, t.paid, t.committed, t.available, t.budget ? (t.paid + t.committed) / t.budget : 0]);
  }
  const rs = XLSX.utils.aoa_to_sheet(res);
  rs['!cols'] = [30, 8, 16, 16, 16, 16, 12].map(w => ({ wch: w }));
  ['C', 'D', 'E', 'F'].forEach(c => setFormats(XLSX, rs, c, '"$"#,##0.00'));
  setFormats(XLSX, rs, 'G', '0.0%');
  XLSX.utils.book_append_sheet(wb, rs, 'Resumen');

  const name = projects.length === 1 ? `OPEX-CAPEX ${projects[0].name}` : 'OPEX-CAPEX proyectos';
  XLSX.writeFile(wb, `${name} ${today()}.xlsx`);
  toast('Excel exportado');
}

function setFormats(XLSX, ws, col, fmt) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = 1; r <= range.e.r; r++) { const c = ws[`${col}${r + 1}`]; if (c) c.z = fmt; }
}

async function exportTemplate() {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS,
    [new Date(), app.state.projects[0]?.name || 'Mi proyecto', 'OPEX', 'Mano de obra', 'Nómina semana 1', 'Contratista X', 'F-001', 125000, 'Pagado'],
    [new Date(), app.state.projects[0]?.name || 'Mi proyecto', 'CAPEX', 'Maquinaria y equipo', 'Compra de revolvedora', 'Proveedor Y', 'OC-010', 380000, 'Comprometido']], { cellDates: true });
  ws['!cols'] = [12, 28, 8, 26, 36, 22, 14, 14, 13].map(w => ({ wch: w }));
  const cats = XLSX.utils.aoa_to_sheet([['OPEX', 'CAPEX'], ...Array.from({ length: Math.max(CATEGORIES.OPEX.length, CATEGORIES.CAPEX.length) }, (_, i) => [CATEGORIES.OPEX[i] || '', CATEGORIES.CAPEX[i] || ''])]);
  cats['!cols'] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
  XLSX.utils.book_append_sheet(wb, cats, 'Categorías');
  XLSX.writeFile(wb, 'Plantilla OPEX-CAPEX.xlsx');
}

async function importExcel() {
  const file = await pickFile('.xlsx,.xls,.csv');
  if (!file) return;
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheetName = wb.SheetNames.find(n => norm(n).startsWith('mov')) || wb.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
  // Buscar la fila de encabezados en las primeras 10 filas.
  const hIdx = data.slice(0, 10).findIndex(row => row.some(c => ['monto', 'importe', 'total'].includes(norm(c))));
  if (hIdx < 0) throw new Error('No encontré una columna "Monto" o "Importe". Descarga la plantilla para ver el formato.');
  const head = data[hIdx].map(norm);
  const col = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const c = {
    date: col('fecha'), project: col('proyecto', 'obra'), type: col('tipo', 'clasificacion'), category: col('categoria', 'rubro', 'partida'),
    concept: col('concepto', 'descripcion'), supplier: col('proveedor'), invoice: col('factura', 'oc', 'orden'),
    amount: col('monto', 'importe', 'total'), status: col('estatus', 'estado', 'status')
  };
  const rows = data.slice(hIdx + 1).filter(r => r[c.amount] !== '' && !isNaN(parseAmount(r[c.amount])));
  if (!rows.length) throw new Error('El archivo no tiene movimientos con monto.');

  const projectNames = [...new Set(rows.map(r => c.project >= 0 ? String(r[c.project]).trim() : '').filter(Boolean))];
  const unknown = projectNames.filter(n => !app.state.projects.some(p => norm(p.name) === norm(n)));
  const noProjectCol = c.project < 0 || projectNames.length === 0;

  openModal('Importar movimientos', `
    <p>Se encontraron <b>${rows.length}</b> movimientos en la hoja <b>${esc(sheetName)}</b>.</p>
    ${unknown.length ? `<p class="small">Proyectos nuevos que se crearán: ${unknown.map(esc).join(', ')}</p>` : ''}
    ${noProjectCol ? `<label>El archivo no indica proyecto. Asignar a:<select name="projectId">${app.projectOptions(filterProject, false)}</select></label>` : ''}
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="replace" style="width:auto">
      Reemplazar los movimientos existentes de esos proyectos (si no, se agregan)</label>`, {
    submitLabel: 'Importar',
    onSubmit: d => {
      if (noProjectCol && !d.projectId) { toast('Crea primero un proyecto'); return false; }
      for (const name of unknown) app.state.projects.push({ id: uid(), name, status: 'Activo', color: '#5b5b60', budgetOpex: 0, budgetCapex: 0, createdAt: today() });
      const pidOf = name => noProjectCol ? d.projectId : app.state.projects.find(p => norm(p.name) === norm(name))?.id;
      const imported = rows.map(r => {
        const typeRaw = norm(c.type >= 0 ? r[c.type] : '');
        const type = typeRaw.includes('cap') || typeRaw.includes('inver') ? 'CAPEX' : 'OPEX';
        const statusRaw = norm(c.status >= 0 ? r[c.status] : 'pagado');
        return {
          id: uid(), projectId: pidOf(c.project >= 0 ? String(r[c.project]).trim() : ''),
          date: parseDateCell(c.date >= 0 ? r[c.date] : ''), type,
          category: (c.category >= 0 && String(r[c.category]).trim()) || (type === 'OPEX' ? 'Otros OPEX' : 'Otros CAPEX'),
          concept: c.concept >= 0 ? String(r[c.concept]).trim() : '', supplier: c.supplier >= 0 ? String(r[c.supplier]).trim() : '',
          invoice: c.invoice >= 0 ? String(r[c.invoice]).trim() : '', amount: parseAmount(r[c.amount]),
          status: statusRaw.startsWith('comp') || statusRaw.startsWith('pend') ? 'Comprometido' : 'Pagado'
        };
      }).filter(r => r.projectId);
      if (d.replace === 'on') {
        const affected = new Set(imported.map(r => r.projectId));
        app.state.finance = app.state.finance.filter(r => !affected.has(r.projectId));
      }
      app.state.finance.push(...imported);
      app.commit();
      toast(`${imported.length} movimientos importados`);
    }
  });
}

const parseAmount = v => typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
function parseDateCell(v) {
  if (v instanceof Date && !isNaN(v)) return toISODate(new Date(v.getTime() + 12 * 3600e3));
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); // dd/mm/aaaa
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return today();
}
