// Motor de priorización y agenda automática (criterios PMO).
//
// Puntaje de cada tarea abierta:
//   • Prioridad (impacto):      Crítica 40 · Alta 30 · Media 20 · Baja 10
//   • Urgencia (fecha compromiso): vencida 40 · hoy 35 · ≤2 días 25 · esta semana 15 · después 5 · sin fecha 0
//   • Ruta crítica / hito:      +15
//   • Ya en curso (terminar lo empezado): +5
//   • Bloqueada: no se agenda (requiere gestión de impedimento, no tiempo de ejecución)
// Las tareas se acomodan de mayor a menor puntaje en los huecos libres de la jornada,
// respetando juntas/compromisos del calendario y la comida, y fraccionándose si no caben en un bloque.

import { diffDays, today, weekStart, addDays, parseTime } from './utils.js';

const PRIO_W = { 1: 40, 2: 30, 3: 20, 4: 10 };

export function scoreTask(task, refDate = today()) {
  const parts = [];
  let score = PRIO_W[task.priority] ?? 20;
  parts.push(`prioridad ${score}`);
  if (task.due) {
    const d = diffDays(refDate, task.due);
    const weekEnd = addDays(weekStart(refDate), 6);
    let u;
    if (d < 0) { u = 40; parts.push(`vencida hace ${-d} d (+40)`); }
    else if (d === 0) { u = 35; parts.push('vence hoy (+35)'); }
    else if (d <= 2) { u = 25; parts.push(`vence en ${d} d (+25)`); }
    else if (task.due <= weekEnd) { u = 15; parts.push('vence esta semana (+15)'); }
    else { u = 5; parts.push('vence después (+5)'); }
    score += u;
  }
  if (task.critical) { score += 15; parts.push('ruta crítica (+15)'); }
  if (task.status === 'En curso') { score += 5; parts.push('en curso (+5)'); }
  return { score, reason: parts.join(' · ') };
}

export const openTasks = tasks => tasks.filter(t => t.status !== 'Hecha');

export function rankTasks(tasks, refDate = today()) {
  return openTasks(tasks)
    .map(t => ({ task: t, ...scoreTask(t, refDate) }))
    .sort((a, b) => b.score - a.score || (a.task.due || '9999').localeCompare(b.task.due || '9999'));
}

// Horas ya trabajadas por tarea en días anteriores no se registran; para días futuros
// se simula el plan desde hoy para que la carga se reparta en cascada.
export function buildDayPlan(state, date) {
  const s = state.settings;
  const start = Number(s.workStart), end = Number(s.workEnd);
  const isWorkDay = s.workDays.includes(new Date(date + 'T12:00').getDay());

  const busy = state.events
    .filter(e => e.date === date && e.start)
    .map(e => ({ start: parseTime(e.start), end: parseTime(e.end) || parseTime(e.start) + 1, type: 'event', event: e }));
  if (isWorkDay && s.lunchStart != null && s.lunchEnd > s.lunchStart) {
    busy.push({ start: Number(s.lunchStart), end: Number(s.lunchEnd), type: 'lunch' });
  }

  const blocks = [...busy];
  if (!isWorkDay) return { blocks: blocks.sort((a, b) => a.start - b.start), unscheduled: [], isWorkDay };

  // Capacidad restante por tarea simulando días laborables desde hoy hasta la fecha pedida.
  const remaining = new Map(openTasks(state.tasks).filter(t => t.status !== 'Bloqueada').map(t => [t.id, Number(t.estimate) || 1]));
  const t0 = today();
  if (date > t0) {
    for (let d = t0; d < date; d = addDays(d, 1)) {
      if (!s.workDays.includes(new Date(d + 'T12:00').getDay())) continue;
      fillDay(state, d, remaining, () => {});
    }
  }
  fillDay(state, date, remaining, b => blocks.push(b));

  const unscheduled = rankTasks(state.tasks, date)
    .filter(r => r.task.status !== 'Bloqueada' && remaining.get(r.task.id) > 0.01)
    .map(r => ({ ...r, hoursLeft: remaining.get(r.task.id) }));

  return { blocks: blocks.sort((a, b) => a.start - b.start), unscheduled, isWorkDay };
}

function freeSlots(state, date) {
  const s = state.settings;
  const busy = state.events
    .filter(e => e.date === date && e.start)
    .map(e => [parseTime(e.start), parseTime(e.end) || parseTime(e.start) + 1]);
  if (s.lunchStart != null && s.lunchEnd > s.lunchStart) busy.push([Number(s.lunchStart), Number(s.lunchEnd)]);
  busy.sort((a, b) => a[0] - b[0]);
  let cursor = Number(s.workStart);
  // Si es hoy, no agendar en horas ya pasadas.
  if (date === today()) {
    const now = new Date();
    const nowH = Math.ceil((now.getHours() + now.getMinutes() / 60) * 4) / 4;
    cursor = Math.max(cursor, nowH);
  }
  const end = Number(s.workEnd);
  const slots = [];
  for (const [bs, be] of busy) {
    if (bs > cursor) slots.push([cursor, Math.min(bs, end)]);
    cursor = Math.max(cursor, be);
  }
  if (cursor < end) slots.push([cursor, end]);
  return slots.filter(([a, b]) => b - a >= 0.25);
}

function fillDay(state, date, remaining, emit) {
  const ranked = rankTasks(state.tasks, date).filter(r => remaining.get(r.task.id) > 0.01);
  let i = 0;
  for (let [a, b] of freeSlots(state, date)) {
    while (a < b - 0.01 && i < ranked.length) {
      const r = ranked[i];
      const left = remaining.get(r.task.id);
      const take = Math.min(left, b - a);
      emit({ start: a, end: a + take, type: 'task', task: r.task, score: r.score, reason: r.reason });
      remaining.set(r.task.id, left - take);
      a += take;
      if (remaining.get(r.task.id) <= 0.01) i++;
    }
  }
}
