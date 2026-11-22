import { app, taskForm } from '../app.js';
import { icon, esc, today, weekStart, addDays, fmtDate, fmtDateShort, prioChip } from '../utils.js';
import { rankTasks } from '../scheduler.js';
import { bindTaskList } from './proyectos.js';

let filterProject = '';

export function render(el) {
  const t0 = today();
  const ws = weekStart(t0);
  const we = addDays(ws, 6);
  const all = app.state.tasks.filter(t => !filterProject || t.projectId === filterProject);
  const ranked = rankTasks(all, t0);

  // Prioridades de la semana: vencidas, que vencen esta semana, o Crítica/Alta sin importar fecha.
  const week = ranked.filter(r => (r.task.due && r.task.due <= we) || r.task.priority <= 2);
  const groups = [
    { color: 'var(--bad)', title: 'Vencidas', items: week.filter(r => r.task.due && r.task.due < t0) },
    { color: 'var(--warn)', title: 'Esta semana', items: week.filter(r => r.task.due && r.task.due >= t0 && r.task.due <= we) },
    { color: 'var(--primary)', title: 'Alta prioridad sin vencer esta semana', items: week.filter(r => !r.task.due || r.task.due > we) }
  ];
  const doneThisWeek = all.filter(t => t.status === 'Hecha' && t.doneAt && t.doneAt >= ws && t.doneAt <= we);
  const blocked = ranked.filter(r => r.task.status === 'Bloqueada');
  const hours = week.reduce((a, r) => a + (Number(r.task.estimate) || 0), 0);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Prioridades de la semana</h1><div class="muted">${fmtDate(ws)} – ${fmtDate(we)}</div></div>
      <div class="toolbar">
        <select data-filter style="width:auto">${app.projectOptions(filterProject).replace('— Sin proyecto —', 'Todos los proyectos')}</select>
        <button class="btn primary" data-new>${icon('plus')} Tarea</button>
      </div>
    </div>
    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="card stat"><div class="l">Prioritarias</div><div class="v">${week.length}</div></div>
      <div class="card stat"><div class="l">Vencidas</div><div class="v" style="color:var(--bad)">${groups[0].items.length}</div></div>
      <div class="card stat"><div class="l">Horas estimadas</div><div class="v">${hours.toFixed(1)}</div></div>
      <div class="card stat"><div class="l">Cerradas esta semana</div><div class="v" style="color:var(--ok)">${doneThisWeek.length}</div></div>
    </div>
    ${blocked.length ? `<div class="notice"><b>Bloqueadas (${blocked.length})</b> — requieren gestionar el impedimento:
      ${blocked.map(r => `<a href="javascript:void 0" data-edit="${r.task.id}">${esc(r.task.title)}</a>`).join(', ')}</div>` : ''}
    ${groups.map(g => `
      <div class="card">
        <h2 class="group-title"><span class="dot" style="background:${g.color}"></span>${g.title} <span class="muted small">(${g.items.length})</span></h2>
        ${g.items.length ? `<div class="list">${g.items.map(row).join('')}</div>` : '<div class="muted small">Nada aquí.</div>'}
      </div>`).join('')}
    ${doneThisWeek.length ? `<div class="card"><h2>Completadas esta semana</h2><div class="list">${doneThisWeek.map(t => `
      <div class="item done"><input type="checkbox" checked data-done="${t.id}"><div class="grow"><div class="title">${esc(t.title)}</div>
      <div class="muted small">${esc(app.projectName(t.projectId))} · cerrada ${fmtDateShort(t.doneAt)}</div></div></div>`).join('')}</div></div>` : ''}`;

  el.querySelector('[data-filter]').onchange = e => { filterProject = e.target.value; render(el); };
  el.querySelector('[data-new]').onclick = () => taskForm(null, { projectId: filterProject || undefined });
  bindTaskList(el);
}

function row(r) {
  const t = r.task;
  return `<div class="item">
    <input type="checkbox" data-done="${t.id}">
    <div class="grow" data-edit="${t.id}" style="cursor:pointer">
      <div class="title"><span class="dot" style="background:${esc(app.projectColor(t.projectId))};margin-right:6px"></span>${esc(t.title)}</div>
      <div class="muted small">${esc(app.projectName(t.projectId))}${t.owner ? ' · ' + esc(t.owner) : ''} · compromiso ${fmtDateShort(t.due)} · ${t.estimate} h
        ${t.status !== 'Pendiente' ? ' · ' + esc(t.status) : ''}${t.critical ? ' · ruta crítica' : ''}</div>
      <div class="muted small" title="${esc(r.reason)}">Puntaje ${r.score}: ${esc(r.reason)}</div>
    </div>
    ${prioChip(t.priority)}
  </div>`;
}
