import { app, taskForm, eventForm } from '../app.js';
import { icon, esc, today, addDays, fmtDayLong, fmtTime, fmtDateShort, prioChip } from '../utils.js';
import { buildDayPlan } from '../scheduler.js';

let current = null;
const HOUR_PX = 60;
export const setAgendaDate = d => { current = d; };

export function render(el) {
  current ??= today();
  const s = app.state.settings;
  const plan = buildDayPlan(app.state, current);
  const first = Math.min(Number(s.workStart), ...plan.blocks.map(b => Math.floor(b.start)));
  const last = Math.max(Number(s.workEnd), ...plan.blocks.map(b => Math.ceil(b.end)));
  const taskHours = plan.blocks.filter(b => b.type === 'task').reduce((a, b) => a + b.end - b.start, 0);
  const eventHours = plan.blocks.filter(b => b.type === 'event').reduce((a, b) => a + b.end - b.start, 0);
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Agenda del día</h1><div class="muted" style="text-transform:capitalize">${fmtDayLong(current)}${current === today() ? ' · hoy' : ''}</div></div>
      <div class="toolbar">
        <button class="btn icon" data-nav="-1" aria-label="Día anterior">${icon('left')}</button>
        <button class="btn" data-nav="0">Hoy</button>
        <button class="btn icon" data-nav="1" aria-label="Día siguiente">${icon('right')}</button>
        <input type="date" value="${current}" data-date style="width:auto">
      </div>
    </div>
    <div class="toolbar" style="margin-bottom:14px">
      <button class="btn primary" data-new-task>${icon('plus')} Tarea</button>
      <button class="btn" data-new-event>${icon('plus')} Compromiso</button>
    </div>
    <div class="grid split">
      <div class="card">
        ${!plan.isWorkDay ? '<div class="muted small" style="margin-bottom:8px">Día no laborable: solo se muestran compromisos.</div>' : ''}
        <div class="agenda" style="height:${(last - first) * HOUR_PX}px">
          ${Array.from({ length: last - first }, (_, i) => `<div class="hour"><span>${fmtTime(first + i)}</span></div>`).join('')}
          ${current === today() && nowH > first && nowH < last ? `<div class="now" style="top:${(nowH - first) * HOUR_PX}px"></div>` : ''}
          ${plan.blocks.map(b => block(b, first)).join('')}
        </div>
      </div>
      <div>
        <div class="card grid grid-3" style="grid-template-columns:repeat(3,1fr);gap:8px">
          <div class="stat"><div class="l">Ejecución</div><div class="v">${taskHours.toFixed(1)} h</div></div>
          <div class="stat"><div class="l">Juntas</div><div class="v">${eventHours.toFixed(1)} h</div></div>
          <div class="stat"><div class="l">Sin agendar</div><div class="v">${plan.unscheduled.length}</div></div>
        </div>
        <div class="card">
          <h2>Pendiente de agendar</h2>
          <p class="muted small" style="margin-top:-4px">No caben hoy; se recorren a los siguientes días por puntaje.</p>
          ${plan.unscheduled.length ? `<div class="list">${plan.unscheduled.slice(0, 12).map(r => `
            <div class="item" data-task="${r.task.id}" style="cursor:pointer">
              <div class="grow"><div class="title">${esc(r.task.title)}</div>
              <div class="muted small">${esc(app.projectName(r.task.projectId))} · ${r.hoursLeft.toFixed(1)} h · compromiso ${fmtDateShort(r.task.due)}</div></div>
              ${prioChip(r.task.priority)}
            </div>`).join('')}</div>` : `<div class="empty">${plan.isWorkDay ? 'Todo cabe en la jornada ' : 'Día no laborable'}</div>`}
        </div>
        <div class="card small muted">
          <b>¿Cómo se arma la agenda?</b> Cada tarea abierta recibe un puntaje PMO:
          prioridad (Crítica 40 · Alta 30 · Media 20 · Baja 10) + urgencia por fecha compromiso
          (vencida 40 · hoy 35 · ≤2 días 25 · semana 15) + ruta crítica 15 + en curso 5.
          Se acomodan de mayor a menor puntaje en los huecos libres entre juntas y comida, según su duración estimada.
          Las tareas bloqueadas no se agendan. Ajusta el horario en Ajustes.
        </div>
      </div>
    </div>`;

  el.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.nav);
    current = n === 0 ? today() : addDays(current, n);
    render(el);
  });
  el.querySelector('[data-date]').onchange = e => { if (e.target.value) { current = e.target.value; render(el); } };
  el.querySelector('[data-new-task]').onclick = () => taskForm(null, { due: current });
  el.querySelector('[data-new-event]').onclick = () => eventForm(null, { date: current });
  el.querySelectorAll('[data-task]').forEach(d => d.onclick = () => taskForm(app.state.tasks.find(t => t.id === d.dataset.task)));
  el.querySelectorAll('[data-event]').forEach(d => d.onclick = () => eventForm(app.state.events.find(e => e.id === d.dataset.event)));
}

function block(b, first) {
  const top = (b.start - first) * HOUR_PX;
  const height = Math.max((b.end - b.start) * HOUR_PX - 2, 14);
  const time = `${fmtTime(b.start)}–${fmtTime(b.end)}`;
  if (b.type === 'lunch') return `<div class="block lunch" style="top:${top}px;height:${height}px"><b>Comida</b></div>`;
  if (b.type === 'event') {
    const e = b.event;
    return `<div class="block event" data-event="${e.id}" style="top:${top}px;height:${height}px">
      <b>${esc(e.title)}</b><span class="small">${time}${e.projectId ? ' · ' + esc(app.projectName(e.projectId)) : ''}</span></div>`;
  }
  const t = b.task;
  return `<div class="block" data-task="${t.id}" title="Puntaje ${b.score}: ${esc(b.reason)}"
      style="top:${top}px;height:${height}px;--bc:${esc(app.projectColor(t.projectId))}">
    ${b.end - b.start < 0.75 ? `<b>${esc(t.title)} <span class="small" style="font-weight:400">· ${time}</span></b>`
      : `<b>${esc(t.title)}</b><span class="small">${time} · ${esc(app.projectName(t.projectId))} · ${b.score} pts</span>`}</div>`;
}
