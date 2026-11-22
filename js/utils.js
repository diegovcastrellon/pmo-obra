// Utilidades compartidas.
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = n => String(n).padStart(2, '0');
export const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const parseDate = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toISODate(d); };
export const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const fmtDate = s => { if (!s) return '—'; const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDateShort = s => { if (!s) return '—'; const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDayLong = s => { const d = parseDate(s); return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`; };
export const monthName = (y, m) => `${MONTHS_LONG[m]} ${y}`;
export const fmtTime = h => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${pad(hh)}:${pad(mm)}`; };
export const parseTime = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h + (m || 0) / 60; };

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export const fmtMoney = n => money.format(Number(n) || 0);

// Inicio de semana (lunes) para una fecha ISO.
export const weekStart = s => { const d = parseDate(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toISODate(d); };

export const PRIORITIES = [
  { v: 1, label: 'Crítica', cls: 'p1' },
  { v: 2, label: 'Alta', cls: 'p2' },
  { v: 3, label: 'Media', cls: 'p3' },
  { v: 4, label: 'Baja', cls: 'p4' }
];
export const prioChip = p => { const x = PRIORITIES.find(q => q.v === Number(p)) || PRIORITIES[2]; return `<span class="chip ${x.cls}">${x.label}</span>`; };

export const PROJECT_COLORS = ['#ba0c2f', '#e0a800', '#5b5b60', '#1d1d1f', '#8a0a24', '#b38f00', '#9a9a9f', '#d4536d'];

export function download(filename, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

// Lee los campos de un formulario como objeto.
export const formData = form => Object.fromEntries(new FormData(form).entries());

export const options = (list, selected, valueKey = 'v', labelKey = 'label') =>
  list.map(o => `<option value="${esc(o[valueKey])}" ${String(o[valueKey]) === String(selected) ? 'selected' : ''}>${esc(o[labelKey])}</option>`).join('');

// Carga perezosa de SheetJS (Excel) desde CDN; el service worker lo guarda para uso sin conexión.
let xlsxPromise;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { xlsxPromise = null; reject(new Error('No se pudo cargar el módulo de Excel. Revisa tu conexión.')); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

// Íconos de línea (estilo SF Symbols simplificado).
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  gantt: '<path d="M4 6h9M8 12h10M6 18h7"/>',
  money: '<path d="M4 20V11M10 20V5M16 20v-7M21 20H3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  task: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>'
};
export const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
