import { loadState, saveState, requestPersistence } from './db.js';
import { esc, uid, today, options, PRIORITIES, PROJECT_COLORS, formData, icon } from './utils.js';
import * as agenda from './views/agenda.js';
import * as prioridades from './views/prioridades.js';
import * as proyectos from './views/proyectos.js';
import * as calendario from './views/calendario.js';
import * as cronograma from './views/cronograma.js';
import * as finanzas from './views/finanzas.js';
import * as ajustes from './views/ajustes.js';

const VIEWS = { agenda, prioridades, proyectos, calendario, cronograma, finanzas, ajustes };

export const app = {
  state: null,
  route: { tab: 'agenda', params: [] },
  // Guarda y vuelve a dibujar la vista actual.
  commit() { saveState(this.state); render(); },
  project(id) { return this.state.projects.find(p => p.id === id); },
  projectName(id) { return this.project(id)?.name || 'Sin proyecto'; },
  projectColor(id) { return this.project(id)?.color || '#7f8c8d'; },
  projectOptions(selected, allowEmpty = true) {
    return (allowEmpty ? '<option value="">— Sin proyecto —</option>' : '') +
      options(this.state.projects.map(p => ({ v: p.id, label: p.name })), selected);
  },
  go(hash) { location.hash = hash; }
};

// ---------- Modal y toast ----------
const modalEl = document.getElementById('modal');
export function openModal(title, bodyHTML, { onSubmit, submitLabel = 'Guardar', onOpen, extraFooter = '', cancelLabel = 'Cancelar' } = {}) {
  modalEl.innerHTML = `
    <form class="sheet" novalidate>
      <header><h2>${esc(title)}</h2><button type="button" class="btn icon" data-close aria-label="Cerrar">${icon('x')}</button></header>
      <div class="body">${bodyHTML}</div>
      <footer>${extraFooter}<button type="button" class="btn ${onSubmit ? '' : 'primary'}" data-close>${esc(cancelLabel)}</button>
        ${onSubmit ? `<button type="submit" class="btn primary">${esc(submitLabel)}</button>` : ''}</footer>
    </form>`;
  modalEl.hidden = false;
  const form = modalEl.querySelector('form');
  form.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!onSubmit) return;
    const ok = await onSubmit(formData(form), form);
    if (ok !== false) closeModal();
  });
  onOpen?.(form);
  form.querySelector('input:not([type=hidden]), textarea, select')?.focus({ preventScroll: true });
  return form;
}
export function closeModal() {
  modalEl.dispatchEvent(new Event('close'));
  modalEl.hidden = true;
  modalEl.innerHTML = '';
}
modalEl.addEventListener('mousedown', e => { if (e.target === modalEl) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalEl.hidden) closeModal(); });

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

export const confirmDialog = msg => window.confirm(msg);

// ---------- Formularios compartidos ----------
export function projectForm(project) {
  const p = project || { color: PROJECT_COLORS[app.state.projects.length % PROJECT_COLORS.length], status: 'Activo' };
  openModal(project ? 'Editar proyecto' : 'Nuevo proyecto', `
    <label>Nombre<input name="name" required value="${esc(p.name)}" placeholder="Ej. Torre Norte – Cimentación"></label>
    <div class="row">
      <label>Cliente<input name="client" value="${esc(p.client)}"></label>
      <label>Gerente / responsable<input name="manager" value="${esc(p.manager)}"></label>
    </div>
    <div class="row">
      <label>Inicio<input type="date" name="startDate" value="${esc(p.startDate)}"></label>
      <label>Fin planeado<input type="date" name="endDate" value="${esc(p.endDate)}"></label>
    </div>
    <div class="row">
      <label>Presupuesto OPEX<input type="number" step="0.01" name="budgetOpex" value="${esc(p.budgetOpex)}"></label>
      <label>Presupuesto CAPEX<input type="number" step="0.01" name="budgetCapex" value="${esc(p.budgetCapex)}"></label>
    </div>
    <div class="row">
      <label>Estatus<select name="status">${options(['Activo', 'En pausa', 'Cerrado'].map(v => ({ v, label: v })), p.status)}</select></label>
      <label>Color<input type="color" name="color" value="${esc(p.color)}"></label>
    </div>`, {
    onSubmit: d => {
      if (!d.name.trim()) { toast('El nombre es obligatorio'); return false; }
      const data = { ...d, budgetOpex: Number(d.budgetOpex) || 0, budgetCapex: Number(d.budgetCapex) || 0 };
      if (project) Object.assign(project, data);
      else app.state.projects.push({ id: uid(), createdAt: today(), ...data });
      app.commit();
      toast('Proyecto guardado');
    }
  });
}

export function taskForm(task, defaults = {}) {
  const t = task || { priority: 3, status: 'Pendiente', estimate: 1, due: today(), ...defaults };
  openModal(task ? 'Editar tarea' : 'Nueva tarea / asignación', `
    <label>Tarea<input name="title" required value="${esc(t.title)}" placeholder="Ej. Revisar estimación de acero"></label>
    <div class="row">
      <label>Proyecto<select name="projectId">${app.projectOptions(t.projectId)}</select></label>
      <label>Responsable<input name="owner" value="${esc(t.owner)}" placeholder="Yo"></label>
    </div>
    <div class="row">
      <label>Prioridad<select name="priority">${options(PRIORITIES, t.priority)}</select></label>
      <label>Fecha compromiso<input type="date" name="due" value="${esc(t.due)}"></label>
    </div>
    <div class="row">
      <label>Duración estimada (horas)<input type="number" min="0.25" step="0.25" name="estimate" value="${esc(t.estimate)}"></label>
      <label>Estatus<select name="status">${options(['Pendiente', 'En curso', 'Bloqueada', 'Hecha'].map(v => ({ v, label: v })), t.status)}</select></label>
    </div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="critical" ${t.critical ? 'checked' : ''} style="width:auto">
      Está en ruta crítica / afecta hito del cronograma</label>
    <label>Notas<textarea name="notes">${esc(t.notes)}</textarea></label>`, {
    extraFooter: task ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Eliminar</button>' : '',
    onOpen: form => form.querySelector('[data-del]')?.addEventListener('click', () => {
      if (!confirmDialog('¿Eliminar esta tarea?')) return;
      app.state.tasks = app.state.tasks.filter(x => x.id !== task.id);
      closeModal(); app.commit();
    }),
    onSubmit: d => {
      if (!d.title.trim()) { toast('Escribe la tarea'); return false; }
      const data = { ...d, priority: Number(d.priority), estimate: Number(d.estimate) || 1, critical: d.critical === 'on' };
      if (task) {
        if (data.status === 'Hecha' && task.status !== 'Hecha') data.doneAt = today();
        Object.assign(task, data);
      } else app.state.tasks.push({ id: uid(), createdAt: today(), ...data });
      app.commit();
      toast('Tarea guardada');
    }
  });
}

export function eventForm(ev, defaults = {}) {
  const e = ev || { date: today(), start: '10:00', end: '11:00', ...defaults };
  openModal(ev ? 'Editar compromiso' : 'Nuevo compromiso en calendario', `
    <label>Título<input name="title" required value="${esc(e.title)}" placeholder="Ej. Junta de avance con cliente"></label>
    <div class="row">
      <label>Fecha<input type="date" name="date" required value="${esc(e.date)}"></label>
      <label>Inicio<input type="time" name="start" value="${esc(e.start)}"></label>
      <label>Fin<input type="time" name="end" value="${esc(e.end)}"></label>
    </div>
    <div class="row">
      <label>Proyecto<select name="projectId">${app.projectOptions(e.projectId)}</select></label>
      <label>Lugar<input name="location" value="${esc(e.location)}"></label>
    </div>
    <label>Notas<textarea name="notes">${esc(e.notes)}</textarea></label>`, {
    extraFooter: ev ? `<button type="button" class="btn danger" data-del style="margin-right:auto">Eliminar</button>
      <button type="button" class="btn" data-ics>.ics</button>` : '',
    onOpen: form => {
      form.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirmDialog('¿Eliminar este compromiso?')) return;
        app.state.events = app.state.events.filter(x => x.id !== ev.id);
        closeModal(); app.commit();
      });
      form.querySelector('[data-ics]')?.addEventListener('click', () => calendario.exportICS([ev], ev.title));
    },
    onSubmit: d => {
      if (!d.title.trim() || !d.date) { toast('Título y fecha son obligatorios'); return false; }
      if (d.end && d.start && d.end <= d.start) { toast('La hora de fin debe ser posterior al inicio'); return false; }
      if (ev) Object.assign(ev, d);
      else app.state.events.push({ id: uid(), ...d });
      app.commit();
      toast('Compromiso guardado');
    }
  });
}

// ---------- Router ----------
function parseHash() {
  const [tab, ...params] = (location.hash.slice(1) || 'agenda').split('/');
  return { tab: VIEWS[tab] ? tab : 'agenda', params: params.map(decodeURIComponent) };
}

function render() {
  const view = document.getElementById('view');
  const { tab } = app.route;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  const scroll = window.scrollY;
  VIEWS[tab].render(view, app.route.params);
  if (app._keepScroll) window.scrollTo(0, scroll);
}

window.addEventListener('hashchange', () => {
  const prevTab = app.route.tab;
  app.route = parseHash();
  app._keepScroll = false;
  render();
  if (prevTab !== app.route.tab) window.scrollTo(0, 0);
  app._keepScroll = true;
});

// Pantalla de bienvenida (≈3 s, un toque la adelanta al final):
//   1. aparece el punto amarillo al centro
//   2. el punto se recorre a la derecha y devela «desk»
//   3. «pmo» sale de detrás de «desk» subiendo a su lugar
//   4. el punto se expande a toda la pantalla y la intro se desvanece
function runSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  try { sessionStorage.setItem('pmo-splash', '1'); } catch { /* sin almacenamiento */ }
  const $ = s => el.querySelector(s);
  const dot = $('.dot'), desk = $('.desk'), pmo = $('.pmo'), tag = $('.splash-tag');
  const remove = () => el.remove();

  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !dot.animate) {
    el.classList.add('static');
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(remove, 350); }, 1000);
    el.addEventListener('click', remove, { once: true });
    return;
  }

  const box = el.getBoundingClientRect();
  const d = dot.getBoundingClientRect();
  const k = desk.getBoundingClientRect();
  const cx = box.width / 2, cy = box.height / 2;
  // Al inicio el logotipo se corre para que el borde izquierdo de «desk» quede al centro de la pantalla,
  // justo donde nace el punto. Luego el punto avanza a la derecha y «desk» se devela detrás de él
  // mientras el logotipo vuelve a quedar centrado.
  const shift = cx - k.left;
  const dx = k.left - (d.left + d.width / 2), dy = cy - (d.top + d.height / 2);
  const t = (delay, duration, easing) => ({ delay, duration, easing, fill: 'both' });
  const ease = 'cubic-bezier(.65,0,.35,1)';
  const logo = $('.splash-logo');

  const anims = [
    logo.animate([{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0px)' }], t(675, 725, ease)),
    dot.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(0)`, offset: 0, easing: 'cubic-bezier(.3,1.6,.5,1)' },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 0.32 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 0.42, easing: ease },
      { transform: 'translate(0px, 0px) scale(1)', offset: 1 }
    ], t(150, 1250)),
    desk.animate([
      { clipPath: `inset(-20% ${k.width}px -20% 0px)` },
      { clipPath: 'inset(-20% 0px -20% 0px)' }
    ], t(675, 725, ease)),
    pmo.animate([{ transform: 'translateY(115%)' }, { transform: 'translateY(0%)' }], t(1400, 650, 'cubic-bezier(.2,.9,.3,1)')),
    tag.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], t(1750, 450, 'ease'))
  ];

  let leaving = false;
  function leave(delay) {
    if (leaving) return;
    leaving = true;
    if (delay === 0) anims.forEach(a => a.finish());
    // Capa amarilla a pantalla completa recortada en círculo desde el punto: crece nítida, sin pixelarse.
    const r = dot.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left, y = r.top + r.height / 2 - box.top;
    const R = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y)) + 2;
    const fill = document.createElement('div');
    fill.className = 'splash-fill';
    el.appendChild(fill);
    fill.animate([
      { clipPath: `circle(${r.width / 2}px at ${x}px ${y}px)` },
      { clipPath: `circle(${R}px at ${x}px ${y}px)` }
    ], t(delay, 650, 'cubic-bezier(.7,0,.84,0)'));
    el.animate([{ opacity: 1 }, { opacity: 0 }], t(delay + 620, 420, 'ease')).finished.then(remove, remove);
  }
  anims[0].finished.then(() => setTimeout(() => leave(0), 1000)).catch(() => {});
  el.addEventListener('click', () => leave(0), { once: true });
}
runSplash();

async function init() {
  app.state = await loadState();
  app.route = parseHash();
  render();
  app._keepScroll = true;
  requestPersistence();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW no registrado', err));
  }
}

import { initInstall } from './install.js';
init();
initInstall();
