import { app, eventForm, taskForm } from '../app.js';
import { setAgendaDate } from './agenda.js';
import { icon, esc, today, toISODate, monthName, fmtDayLong, prioChip, download } from '../utils.js';

let ym = null;      // [año, mes]
let selected = null;

export function render(el) {
  const t0 = today();
  ym ??= [new Date().getFullYear(), new Date().getMonth()];
  selected ??= t0;
  const [y, m] = ym;
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes primero
  const days = [];
  for (let i = 0; i < 42; i++) days.push(toISODate(new Date(y, m, 1 - startOffset + i)));
  const evByDay = groupBy(app.state.events, e => e.date);
  const taskByDay = groupBy(app.state.tasks.filter(t => t.status !== 'Hecha' && t.due), t => t.due);
  const selEvents = (evByDay[selected] || []).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const selTasks = taskByDay[selected] || [];

  el.innerHTML = `
    <div class="page-head">
      <h1 style="text-transform:capitalize">${monthName(y, m)}</h1>
      <div class="toolbar">
        <button class="btn icon" data-m="-1">${icon('left')}</button><button class="btn" data-m="0">Hoy</button><button class="btn icon" data-m="1">${icon('right')}</button>
        <button class="btn" data-export title="Exportar compromisos futuros a Outlook, Google o Apple Calendar">${icon('share')} Exportar .ics</button>
        <button class="btn primary" data-new>${icon('plus')} Compromiso</button>
      </div>
    </div>
    <div class="grid split">
      <div class="card">
        <div class="cal">
          ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => `<div class="dow">${d}</div>`).join('')}
          ${days.map(d => {
            const evs = evByDay[d] || [], tks = taskByDay[d] || [];
            const cls = [Number(d.slice(5, 7)) - 1 !== m && 'other', d === t0 && 'today', d === selected && 'sel'].filter(Boolean).join(' ');
            return `<div class="day ${cls}" data-day="${d}"><div class="n">${Number(d.slice(8))}</div>
              ${evs.slice(0, 3).map(e => `<div class="ev">${esc(e.start || '')} ${esc(e.title)}</div>`).join('')}
              ${tks.slice(0, 2).map(t => `<div class="ev task">${esc(t.title)}</div>`).join('')}
              ${evs.length + tks.length > 5 ? `<div class="small muted">+${evs.length + tks.length - 5}</div>` : ''}</div>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <h2 style="text-transform:capitalize">${fmtDayLong(selected)}</h2>
        <div class="toolbar" style="margin-bottom:10px">
          <button class="btn sm" data-new-day>${icon('plus')} Compromiso este día</button>
          <a class="btn sm" href="#agenda" data-agenda>Ver agenda por hora</a>
        </div>
        <h3>Compromisos</h3>
        ${selEvents.length ? `<div class="list">${selEvents.map(e => `
          <div class="item" data-ev="${e.id}" style="cursor:pointer">
            <span class="dot" style="background:${esc(app.projectColor(e.projectId))};margin-top:6px"></span>
            <div class="grow"><div class="title">${esc(e.title)}</div>
            <div class="muted small">${esc(e.start || '')}–${esc(e.end || '')}${e.projectId ? ' · ' + esc(app.projectName(e.projectId)) : ''}${e.location ? ' · ' + esc(e.location) : ''}</div></div>
          </div>`).join('')}</div>` : '<div class="muted small">Sin compromisos.</div>'}
        <h3 style="margin-top:14px">Tareas que vencen</h3>
        ${selTasks.length ? `<div class="list">${selTasks.map(t => `
          <div class="item" data-task="${t.id}" style="cursor:pointer"><div class="grow"><div class="title">${esc(t.title)}</div>
          <div class="muted small">${esc(app.projectName(t.projectId))}</div></div>${prioChip(t.priority)}</div>`).join('')}</div>` : '<div class="muted small">Ninguna.</div>'}
      </div>
    </div>`;

  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.m);
    if (n === 0) { ym = [new Date().getFullYear(), new Date().getMonth()]; selected = t0; }
    else { const d = new Date(y, m + n, 1); ym = [d.getFullYear(), d.getMonth()]; }
    render(el);
  });
  el.querySelectorAll('[data-day]').forEach(d => d.onclick = () => { selected = d.dataset.day; render(el); });
  el.querySelector('[data-agenda]').onclick = () => setAgendaDate(selected);
  el.querySelector('[data-new]').onclick = () => eventForm(null, { date: selected });
  el.querySelector('[data-new-day]').onclick = () => eventForm(null, { date: selected });
  el.querySelector('[data-export]').onclick = () => {
    const upcoming = app.state.events.filter(e => e.date >= t0);
    if (!upcoming.length) return alert('No hay compromisos futuros para exportar.');
    exportICS(upcoming, 'Compromisos PMO');
  };
  el.querySelectorAll('[data-ev]').forEach(d => d.onclick = () => eventForm(app.state.events.find(e => e.id === d.dataset.ev)));
  el.querySelectorAll('[data-task]').forEach(d => d.onclick = () => taskForm(app.state.tasks.find(t => t.id === d.dataset.task)));
}

function groupBy(list, key) {
  return list.reduce((acc, x) => ((acc[key(x)] ||= []).push(x), acc), {});
}

// Genera un archivo .ics (estándar iCalendar) que se abre en Outlook, Google Calendar o Calendario de Apple.
export function exportICS(events, name) {
  const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const dt = (date, time) => date.replace(/-/g, '') + 'T' + (time || '09:00').replace(':', '') + '00';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PMO Desk//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@pmo-obra`, `DTSTAMP:${stamp}`,
      `DTSTART:${dt(e.date, e.start)}`, `DTEND:${dt(e.date, e.end || e.start)}`,
      `SUMMARY:${icsEsc(e.title)}`,
      `DESCRIPTION:${icsEsc([e.projectId ? 'Proyecto: ' + app.projectName(e.projectId) : '', e.notes].filter(Boolean).join('\n'))}`);
    if (e.location) lines.push(`LOCATION:${icsEsc(e.location)}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download(`${name}.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8');
}
