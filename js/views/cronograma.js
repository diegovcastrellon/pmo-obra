// Cronograma: importa / edita / exporta archivos XML de Microsoft Project (Archivo › Guardar como › XML).
// Se edita el mismo documento XML, así que todo lo que la app no muestra (recursos, calendarios,
// asignaciones, campos personalizados) se conserva al exportar.
import { app, toast, confirmDialog, openModal } from '../app.js';
import { icon, esc, uid, today, fmtDate, download, pickFile, parseDate, toISODate, addDays } from '../utils.js';

const NS = 'http://schemas.microsoft.com/project';
let cache = { pid: null, xml: null, doc: null };
let filter = 'all';
let selectedUID = null;

export function render(el, [pidParam]) {
  const projects = app.state.projects;
  const pid = pidParam && app.project(pidParam) ? pidParam : (projects.find(p => app.state.schedules[p.id]) || projects[0])?.id;
  const sched = pid && app.state.schedules[pid];
  const scrollLeft = el.querySelector('.gantt-right')?.scrollLeft;

  el.innerHTML = `
    <div class="page-head">
      <h1>Cronograma de obra</h1>
      <div class="toolbar">
        ${projects.length ? `<select data-project style="width:auto">${app.projectOptions(pid, false)}</select>` : ''}
      </div>
    </div>
    <div id="body"></div>`;
  const body = el.querySelector('#body');
  el.querySelector('[data-project]')?.addEventListener('change', e => app.go(`cronograma/${e.target.value}`));

  if (!projects.length) {
    body.innerHTML = `<div class="card empty">Primero crea un proyecto en <a href="#proyectos">Proyectos</a>.</div>`;
    return;
  }
  if (!sched) return renderEmpty(body, pid);

  const doc = getDoc(pid, sched.xml);
  if (!doc) {
    body.innerHTML = `<div class="card empty">El archivo guardado no es un XML válido de MS Project.<br><br><button class="btn" data-import>Importar otro</button></div>`;
    body.querySelector('[data-import]').onclick = () => importXML(pid);
    return;
  }
  renderGantt(body, pid, sched, doc);
  const right = body.querySelector('.gantt-right');
  if (right) {
    if (scrollLeft != null) right.scrollLeft = scrollLeft;
    else { const line = right.querySelector('.gantt-today'); if (line) right.scrollLeft = Math.max(0, line.offsetLeft - 120); }
  }
}

function renderEmpty(el, pid) {
  el.innerHTML = `
    <div class="card">
      <h2>Importa tu cronograma de MS Project</h2>
      <ol class="small" style="padding-left:18px;line-height:1.7">
        <li>Abre tu archivo <b>.mpp</b> en Microsoft Project.</li>
        <li>Ve a <b>Archivo › Guardar como</b> y elige el tipo <b>“Formato XML (*.xml)”</b>.</li>
        <li>Importa aquí ese .xml. Podrás ver el Gantt y editar nombres, fechas, % de avance y agregar actividades.</li>
        <li>Cuando termines, usa <b>Exportar XML</b> y ábrelo en MS Project (Archivo › Abrir › tipo XML), luego guárdalo como .mpp.</li>
      </ol>
      <div class="toolbar"><button class="btn primary" data-import>${icon('folder')} Importar XML de MS Project</button>
        <button class="btn" data-blank>Crear cronograma vacío</button></div>
    </div>`;
  el.querySelector('[data-import]').onclick = () => importXML(pid);
  el.querySelector('[data-blank]').onclick = () => {
    const name = app.projectName(pid);
    const start = today() + 'T08:00:00';
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="${NS}"><SaveVersion>14</SaveVersion><Name>${esc(name)}.xml</Name><Title>${esc(name)}</Title>
<ScheduleFromStart>1</ScheduleFromStart><StartDate>${start}</StartDate><MinutesPerDay>${app.state.settings.hoursPerDay * 60}</MinutesPerDay>
<Tasks><Task><UID>0</UID><ID>0</ID><Name>${esc(name)}</Name><Type>1</Type><IsNull>0</IsNull><OutlineNumber>0</OutlineNumber><OutlineLevel>0</OutlineLevel>
<Start>${start}</Start><Finish>${today()}T17:00:00</Finish><Duration>PT8H0M0S</Duration><DurationFormat>7</DurationFormat><Milestone>0</Milestone><Summary>1</Summary><PercentComplete>0</PercentComplete></Task></Tasks></Project>`;
    app.state.schedules[pid] = { fileName: `${name}.xml`, xml, importedAt: today() };
    cache.pid = null;
    app.commit();
  };
}

async function importXML(pid) {
  const file = await pickFile('.xml,text/xml,application/xml');
  if (!file) return;
  if (/\.mpp$/i.test(file.name)) return toast('Los .mpp no se pueden leer: guárdalo como XML desde MS Project');
  const xml = await file.text();
  const doc = parse(xml);
  if (!doc || doc.documentElement.localName !== 'Project') return toast('Ese archivo no es un XML de MS Project');
  const s = app.state.schedules[pid];
  if (s && !confirmDialog('Este proyecto ya tiene un cronograma. ¿Reemplazarlo?')) return;
  app.state.schedules[pid] = { fileName: file.name, xml, importedAt: today() };
  cache.pid = null;
  app.commit();
  toast(`Cronograma importado: ${tasksOf(doc).length} actividades`);
}

// ---------- XML helpers ----------
function parse(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}
function getDoc(pid, xml) {
  if (cache.pid !== pid || cache.xml !== xml) {
    const doc = parse(xml);
    if (doc) rollupSummaries(doc);
    cache = { pid, xml, doc };
  }
  return cache.doc;
}
const kids = (el, name) => [...el.children].filter(c => c.localName === name);
const get = (el, name) => kids(el, name)[0]?.textContent ?? '';
function set(el, name, value) {
  let c = kids(el, name)[0];
  if (!c) { c = el.ownerDocument.createElementNS(el.namespaceURI || NS, name); el.appendChild(c); }
  c.textContent = value;
}
function tasksOf(doc) {
  const tasksEl = [...doc.documentElement.children].find(c => c.localName === 'Tasks');
  return tasksEl ? kids(tasksEl, 'Task').filter(t => get(t, 'IsNull') !== '1') : [];
}
// El serializador del navegador omite la declaración XML; MS Project la espera.
function serialize(doc) {
  const xml = new XMLSerializer().serializeToString(doc);
  return xml.startsWith('<?xml') ? xml : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
}
function save(pid, doc) {
  rollupSummaries(doc);
  const xml = serialize(doc);
  const s = app.state.schedules[pid];
  s.xml = xml; s.modified = today();
  cache = { pid, xml, doc };
  app.commit();
}

// Días hábiles (lun–vie) entre dos fechas, inclusive.
function workDays(a, b) {
  let n = 0;
  for (let d = parseDate(a); d <= parseDate(b); d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0) n++;
  return Math.max(n, 1);
}
const durationOf = (start, finish, milestone) =>
  milestone ? 'PT0H0M0S' : `PT${workDays(start, finish) * app.state.settings.hoursPerDay}H0M0S`;

function readTask(t) {
  return {
    el: t, uid: get(t, 'UID'), id: get(t, 'ID'), name: get(t, 'Name'),
    level: Number(get(t, 'OutlineLevel') || 1), wbs: get(t, 'OutlineNumber'),
    start: get(t, 'Start').slice(0, 10), finish: get(t, 'Finish').slice(0, 10),
    pct: Number(get(t, 'PercentComplete') || 0), summary: get(t, 'Summary') === '1',
    milestone: get(t, 'Milestone') === '1', critical: get(t, 'Critical') === '1',
    preds: kids(t, 'PredecessorLink').map(l => get(l, 'PredecessorUID'))
  };
}

// Recalcula fechas y avance de las tareas resumen a partir de sus hijas (para visualizar; Project recalcula al abrir).
function rollupSummaries(doc) {
  const list = tasksOf(doc).map(readTask);
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (!s.summary) continue;
    const children = [];
    for (let j = i + 1; j < list.length && list[j].level > s.level; j++) if (list[j].level === s.level + 1) children.push(list[j]);
    if (!children.length) continue;
    const start = children.map(c => c.start).filter(Boolean).sort()[0];
    const finish = children.map(c => c.finish).filter(Boolean).sort().pop();
    const timeOf = (el, f, def) => get(el, f).slice(10) || def;
    if (start) { set(s.el, 'Start', start + timeOf(s.el, 'Start', 'T08:00:00')); s.start = start; }
    if (finish) { set(s.el, 'Finish', finish + timeOf(s.el, 'Finish', 'T17:00:00')); s.finish = finish; }
    let w = 0, acc = 0;
    for (const c of children) { const d = c.start && c.finish ? workDays(c.start, c.finish) : 1; w += d; acc += d * c.pct; }
    s.pct = Math.round(acc / w);
    set(s.el, 'PercentComplete', s.pct);
    if (start && finish) set(s.el, 'Duration', durationOf(start, finish));
  }
}

// ---------- Vista ----------
function renderGantt(el, pid, sched, doc) {
  const t0 = today();
  const all = tasksOf(doc).map(readTask).filter(t => t.level > 0);
  const byUID = Object.fromEntries(all.map(t => [t.uid, t]));
  const isLate = t => !t.summary && t.finish && t.finish < t0 && t.pct < 100;
  const isActive = t => !t.summary && t.start <= t0 && t.finish >= t0 && t.pct < 100;
  const shown = all.filter(t => filter === 'all' || (filter === 'active' && isActive(t)) || (filter === 'late' && isLate(t)) || (filter === 'critical' && t.critical));
  const leaf = all.filter(t => !t.summary);
  const overall = leaf.length ? Math.round(leaf.reduce((a, t) => a + t.pct * workDays(t.start || t0, t.finish || t0), 0) / leaf.reduce((a, t) => a + workDays(t.start || t0, t.finish || t0), 0)) : 0;
  const planned = leaf.length ? Math.round(100 * leaf.reduce((a, t) => {
    if (!t.start || !t.finish) return a;
    const total = workDays(t.start, t.finish);
    const elapsed = t0 < t.start ? 0 : t0 >= t.finish ? total : workDays(t.start, t0);
    return a + elapsed;
  }, 0) / leaf.reduce((a, t) => a + (t.start && t.finish ? workDays(t.start, t.finish) : 0), 0)) || 0 : 0;

  // Escala del Gantt
  const dates = all.flatMap(t => [t.start, t.finish]).filter(Boolean).sort();
  const minD = addDays(dates[0] || t0, -3), maxD = addDays(dates.at(-1) || addDays(t0, 30), 7);
  const span = (parseDate(maxD) - parseDate(minD)) / 86400000;
  const px = span > 365 ? 4 : span > 150 ? 8 : span > 60 ? 16 : 28;
  const x = d => ((parseDate(d) - parseDate(minD)) / 86400000) * px;
  const width = span * px;
  const months = [];
  for (let d = parseDate(minD); d <= parseDate(maxD); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(toISODate(d));

  el.innerHTML = `
    <div class="card" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
      <div class="small"><b>${esc(sched.fileName)}</b><div class="muted">Importado ${fmtDate(sched.importedAt)}${sched.modified ? ` · modificado ${fmtDate(sched.modified)}` : ''} · ${leaf.length} actividades</div></div>
      <div class="toolbar">
        <span class="chip">Real ${overall}%</span><span class="chip ${overall + 5 < planned ? 'bad' : 'ok'}">Programado ${planned}%</span>
        <button class="btn sm" data-add>${icon('plus')} Actividad</button>
        <button class="btn sm" data-import>Reemplazar</button>
        <button class="btn sm primary" data-export>${icon('download')} Exportar XML</button>
      </div>
    </div>
    <div class="seg" style="margin-bottom:14px">
      ${[['all', 'Todas'], ['active', `En curso hoy (${all.filter(isActive).length})`], ['late', `Atrasadas (${all.filter(isLate).length})`], ['critical', `Ruta crítica (${all.filter(t => t.critical).length})`]]
        .map(([k, l]) => `<button class="btn sm ${filter === k ? 'primary' : ''}" data-filter="${k}">${l}</button>`).join('')}
    </div>
    ${shown.length ? `<div class="gantt">
      <div class="gantt-left"><table>
        <thead><tr><th>ID</th><th>Actividad</th><th>Inicio</th><th>Fin</th><th class="num">%</th><th>Pred.</th><th></th></tr></thead>
        <tbody>${shown.map(t => `
          <tr data-uid="${t.uid}" class="${t.summary ? 'summary' : ''} ${t.uid === selectedUID ? 'sel' : ''}">
            <td class="muted">${esc(t.id)}</td>
            <td style="padding-left:${6 + (t.level - 1) * 14}px;min-width:220px">
              <input data-f="name" value="${esc(t.name)}" style="min-width:${200 - (t.level - 1) * 14}px;${t.summary ? 'font-weight:700' : ''}${isLate(t) ? ';color:var(--bad)' : ''}"></td>
            <td><input type="date" data-f="start" value="${t.start}" ${t.summary ? 'disabled' : ''} style="width:130px"></td>
            <td><input type="date" data-f="finish" value="${t.finish}" ${t.summary ? 'disabled' : ''} style="width:130px"></td>
            <td class="num"><input type="number" min="0" max="100" data-f="pct" value="${t.pct}" ${t.summary ? 'disabled' : ''} style="width:56px;text-align:right"></td>
            <td class="muted small">${t.preds.map(u => byUID[u]?.id ?? '').filter(Boolean).join(',')}</td>
            <td>${t.summary ? '' : `<button class="btn sm icon" data-totask title="Enviar a mis tareas / agenda">${icon('task')}</button>
              <button class="btn sm icon danger" data-del title="Eliminar actividad">${icon('x')}</button>`}</td>
          </tr>`).join('')}</tbody></table></div>
      <div class="gantt-right"><div style="width:${width}px;position:relative">
        <div class="gantt-head">${months.map(m => `<div style="left:${Math.max(0, x(m))}px">${esc(fmtDate(m).slice(2))}</div>`).join('')}</div>
        ${t0 >= minD && t0 <= maxD ? `<div class="gantt-today" style="left:${x(t0)}px" title="Hoy"></div>` : ''}
        ${shown.map(t => `<div class="gantt-row">${!t.start ? '' : t.milestone
          ? `<div class="gantt-ms" style="left:${x(t.start)}px" title="${esc(t.name)}"></div>`
          : `<div class="gantt-bar ${t.summary ? 'summary' : ''} ${t.critical && !t.summary ? 'critical' : ''}"
               style="left:${x(t.start)}px;width:${Math.max(px, x(addDays(t.finish, 1)) - x(t.start))}px"
               title="${esc(t.name)} · ${fmtDate(t.start)} → ${fmtDate(t.finish)} · ${t.pct}%"><div style="width:${t.pct}%"></div></div>`}</div>`).join('')}
      </div></div>
    </div>` : '<div class="card empty">No hay actividades con este filtro.</div>'}
    <p class="muted small">Edita directamente en la tabla. Las barras rojas son ruta crítica; la línea amarilla marca el día de hoy.
      Las dependencias se conservan del archivo original y MS Project recalcula la ruta crítica al abrir el XML exportado.</p>`;

  el.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; app.commit(); });
  el.querySelector('[data-import]').onclick = () => importXML(pid);
  el.querySelector('[data-export]').onclick = () => {
    const name = sched.fileName.replace(/\.xml$/i, '') + ' (editado).xml';
    download(name, serialize(doc), 'application/xml');
    toast('XML exportado. Ábrelo en MS Project y guárdalo como .mpp');
  };
  el.querySelector('[data-add]').onclick = () => addTaskForm(pid, doc);

  el.querySelectorAll('tr[data-uid]').forEach(tr => {
    const t = byUID[tr.dataset.uid];
    tr.addEventListener('focusin', () => { selectedUID = t.uid; });
    tr.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
      const v = inp.value;
      if (inp.dataset.f === 'name') { if (!v.trim()) return; set(t.el, 'Name', v); }
      if (inp.dataset.f === 'pct') set(t.el, 'PercentComplete', Math.max(0, Math.min(100, Math.round(Number(v) || 0))));
      if (inp.dataset.f === 'start' || inp.dataset.f === 'finish') {
        if (!v) return;
        let start = inp.dataset.f === 'start' ? v : t.start;
        let finish = inp.dataset.f === 'finish' ? v : t.finish;
        // Mover el inicio conserva la duración; mover el fin la cambia.
        if (inp.dataset.f === 'start' && t.start && t.finish) {
          finish = addDays(finish, Math.round((parseDate(v) - parseDate(t.start)) / 86400000));
        }
        if (finish < start) finish = start;
        set(t.el, 'Start', start + (get(t.el, 'Start').slice(10) || 'T08:00:00'));
        set(t.el, 'Finish', finish + (get(t.el, 'Finish').slice(10) || 'T17:00:00'));
        set(t.el, 'Duration', durationOf(start, finish, t.milestone));
      }
      save(pid, doc);
    }));
    tr.querySelector('[data-del]')?.addEventListener('click', () => {
      if (!confirmDialog(`¿Eliminar "${t.name}"? Se quitarán también sus vínculos de dependencia.`)) return;
      t.el.remove();
      tasksOf(doc).forEach(o => kids(o, 'PredecessorLink').forEach(l => { if (get(l, 'PredecessorUID') === t.uid) l.remove(); }));
      renumber(doc);
      save(pid, doc);
    });
    tr.querySelector('[data-totask]')?.addEventListener('click', () => {
      const exists = app.state.tasks.find(x => x.scheduleRef === `${pid}:${t.uid}` && x.status !== 'Hecha');
      if (exists) return toast('Ya está en tus tareas');
      app.state.tasks.push({ id: uid(), projectId: pid, title: t.name, due: t.finish || today(), priority: t.critical ? 1 : 2,
        estimate: 2, status: t.pct > 0 ? 'En curso' : 'Pendiente', critical: t.critical, source: 'Cronograma', scheduleRef: `${pid}:${t.uid}`, createdAt: today() });
      app.commit();
      toast('Agregada a tus tareas y a la agenda');
    });
  });
}

function renumber(doc) {
  tasksOf(doc).forEach((t, i) => set(t, 'ID', String(i)));
}

function addTaskForm(pid, doc) {
  const list = tasksOf(doc).map(readTask);
  const parents = list.filter(t => t.level >= 0);
  openModal('Nueva actividad', `
    <label>Nombre<input name="name" required></label>
    <div class="row">
      <label>Inicio<input type="date" name="start" value="${today()}"></label>
      <label>Fin<input type="date" name="finish" value="${addDays(today(), 4)}"></label>
    </div>
    <label>Insertar después de<select name="after">${parents.map(t =>
      `<option value="${t.uid}" ${t === parents.at(-1) ? 'selected' : ''}>${esc(t.id)} · ${esc(t.name)}</option>`).join('')}</select></label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="milestone" style="width:auto"> Es un hito</label>`, {
    onSubmit: d => {
      if (!d.name.trim()) return false;
      const after = list.find(t => t.uid === d.after);
      const tasksEl = [...doc.documentElement.children].find(c => c.localName === 'Tasks');
      const newUID = Math.max(0, ...list.map(t => Number(t.uid) || 0)) + 1;
      const level = after ? Math.max(1, after.summary ? after.level + 1 : after.level) : 1;
      const finish = d.milestone ? d.start : (d.finish < d.start ? d.start : d.finish);
      const el = doc.createElementNS(tasksEl.namespaceURI || NS, 'Task');
      // Orden de campos según el esquema de MS Project.
      [['UID', newUID], ['ID', 0], ['Name', d.name], ['Type', 1], ['IsNull', 0], ['CreateDate', today() + 'T08:00:00'],
       ['OutlineLevel', level], ['Priority', 500], ['Start', d.start + 'T08:00:00'], ['Finish', finish + 'T17:00:00'],
       ['Duration', durationOf(d.start, finish, !!d.milestone)], ['DurationFormat', 7], ['Milestone', d.milestone ? 1 : 0],
       ['Summary', 0], ['PercentComplete', 0]
      ].forEach(([k, v]) => { const c = doc.createElementNS(el.namespaceURI, k); c.textContent = v; el.appendChild(c); });
      // Insertar al final del bloque de "after" (después de sus subtareas si es resumen).
      let ref = after?.el;
      if (after) {
        const idx = list.indexOf(after);
        for (let j = idx + 1; j < list.length && list[j].level > after.level; j++) ref = list[j].el;
      }
      if (ref) ref.after(el); else tasksEl.appendChild(el);
      renumber(doc);
      save(pid, doc);
      toast('Actividad agregada');
    }
  });
}
