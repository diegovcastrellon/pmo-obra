import { app, toast, confirmDialog } from '../app.js';
import { esc, today, download, pickFile } from '../utils.js';
import { DEFAULT_STATE } from '../db.js';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function render(el) {
  const s = app.state.settings;
  const st = app.state;
  el.innerHTML = `
    <div class="page-head"><h1>Ajustes</h1></div>
    <div class="grid grid-2">
      <form class="card" data-hours>
        <h2>Jornada laboral (para la agenda automática)</h2>
        <div class="row">
          <label>Entrada<input type="number" min="0" max="23" step="0.5" name="workStart" value="${s.workStart}"></label>
          <label>Salida<input type="number" min="1" max="24" step="0.5" name="workEnd" value="${s.workEnd}"></label>
        </div>
        <div class="row">
          <label>Comida inicio<input type="number" min="0" max="23" step="0.5" name="lunchStart" value="${s.lunchStart}"></label>
          <label>Comida fin<input type="number" min="0" max="24" step="0.5" name="lunchEnd" value="${s.lunchEnd}"></label>
          <label>Horas por día (cronograma)<input type="number" min="1" max="24" name="hoursPerDay" value="${s.hoursPerDay}"></label>
        </div>
        <label>Días laborables</label>
        <div class="toolbar" style="margin-bottom:12px">${DAYS.map((d, i) => `
          <label style="display:flex;gap:4px;align-items:center;margin:0;color:var(--text)"><input type="checkbox" name="d${i}" ${s.workDays.includes(i) ? 'checked' : ''} style="width:auto">${d}</label>`).join('')}</div>
        <button class="btn primary">Guardar jornada</button>
      </form>
      <div class="card">
        <h2>Respaldo de datos</h2>
        <p class="small muted">Tus datos se guardan solo en este dispositivo. Exporta un respaldo con frecuencia y
          impórtalo en tu otro dispositivo (celular ↔ PC) para pasar la información. Los audios de las minutas no se incluyen.</p>
        <p class="small">${st.projects.length} proyectos · ${st.tasks.length} tareas · ${st.updates.length} actualizaciones ·
          ${st.minutes.length} minutas · ${st.events.length} compromisos · ${st.finance.length} movimientos</p>
        <div class="toolbar">
          <button class="btn primary" data-backup>Exportar respaldo</button>
          <button class="btn" data-restore>Importar respaldo</button>
        </div>
        <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
        <h3>Instalar en el celular o PC</h3>
        <p class="small muted"><b>iPhone:</b> en Safari toca Compartir › “Agregar a inicio”.
          <b>Android:</b> en Chrome, menú ⋮ › “Instalar app”. <b>PC:</b> en Chrome o Edge, ícono de instalar en la barra de direcciones.</p>
        <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
        <button class="btn danger" data-demo>Cargar datos de ejemplo</button>
        <button class="btn danger" data-wipe>Borrar todo</button>
      </div>
    </div>`;

  el.querySelector('[data-hours]').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const n = k => Number(f.get(k));
    if (n('workEnd') <= n('workStart')) return toast('La salida debe ser después de la entrada');
    Object.assign(s, { workStart: n('workStart'), workEnd: n('workEnd'), lunchStart: n('lunchStart'), lunchEnd: n('lunchEnd'),
      hoursPerDay: n('hoursPerDay') || 8, workDays: DAYS.map((_, i) => i).filter(i => f.get('d' + i)) });
    app.commit(); toast('Jornada guardada');
  };
  el.querySelector('[data-backup]').onclick = () => {
    download(`Respaldo PMO Obra ${today()}.json`, JSON.stringify(app.state, null, 1), 'application/json');
  };
  el.querySelector('[data-restore]').onclick = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.projects)) throw new Error();
      if (!confirmDialog('Esto reemplazará todos los datos de este dispositivo con el respaldo. ¿Continuar?')) return;
      app.state = { ...DEFAULT_STATE(), ...data };
      app.commit(); toast('Respaldo importado');
    } catch { toast('Archivo de respaldo no válido'); }
  };
  el.querySelector('[data-wipe]').onclick = () => {
    if (!confirmDialog('¿Borrar TODOS los datos de este dispositivo? No se puede deshacer (exporta un respaldo antes).')) return;
    app.state = DEFAULT_STATE(); app.commit(); toast('Datos borrados');
  };
  el.querySelector('[data-demo]').onclick = () => {
    if (st.projects.length && !confirmDialog('Se agregarán datos de ejemplo a los tuyos. ¿Continuar?')) return;
    loadDemo(); app.commit(); toast('Datos de ejemplo cargados');
  };
}

function loadDemo() {
  const t = today();
  const add = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const id = () => Math.random().toString(36).slice(2, 10);
  const p1 = id(), p2 = id();
  const S = app.state;
  S.projects.push(
    { id: p1, name: 'Nave industrial Apodaca', client: 'Grupo Norte', manager: 'Yo', startDate: add(t, -60), endDate: add(t, 120), budgetOpex: 2500000, budgetCapex: 18000000, status: 'Activo', color: '#ba0c2f', createdAt: t },
    { id: p2, name: 'Remodelación oficinas Torre B', client: 'Inmobiliaria Sur', manager: 'Yo', startDate: add(t, -20), endDate: add(t, 45), budgetOpex: 800000, budgetCapex: 3200000, status: 'Activo', color: '#e0a800', createdAt: t }
  );
  S.updates.push(
    { id: id(), projectId: p1, date: add(t, -1), progress: 34, status: 'En riesgo', done: 'Colado de zapatas eje A-C. Armado de acero en eje D.', issues: 'Retraso en entrega de acero de refuerzo (3 días).', next: 'Confirmar fecha con proveedor; reprogramar colado eje D.', weather: 'Soleado', crew: 42 },
    { id: id(), projectId: p2, date: add(t, -1), progress: 52, status: 'En tiempo', done: 'Instalación de muros de tablaroca nivel 3.', next: 'Inicio de instalaciones eléctricas.', crew: 15 }
  );
  const task = (projectId, title, priority, due, estimate, extra = {}) => S.tasks.push({ id: id(), projectId, title, priority, due, estimate, status: 'Pendiente', createdAt: t, ...extra });
  task(p1, 'Conciliar estimación #4 con contratista', 1, add(t, -1), 2, { critical: true });
  task(p1, 'Revisar programa de suministro de acero', 1, t, 1.5, { critical: true, status: 'En curso' });
  task(p1, 'Enviar reporte semanal al cliente', 2, add(t, 1), 1);
  task(p2, 'Aprobar muestras de acabados', 2, add(t, 2), 1);
  task(p2, 'Cotizar luminarias LED', 3, add(t, 4), 2);
  task(p1, 'Actualizar matriz de riesgos', 3, add(t, 6), 1.5);
  task(p2, 'Gestionar permiso de maniobras', 2, add(t, 3), 1, { status: 'Bloqueada' });
  S.events.push(
    { id: id(), title: 'Junta de coordinación de obra', date: t, start: '09:00', end: '10:00', projectId: p1, location: 'Oficina de obra' },
    { id: id(), title: 'Recorrido con cliente', date: t, start: '12:00', end: '13:00', projectId: p2 },
    { id: id(), title: 'Comité de proyecto', date: add(t, 2), start: '16:00', end: '17:30', projectId: p1 }
  );
  const fin = (projectId, type, category, concept, amount, status, supplier, d) => S.finance.push({ id: id(), projectId, type, category, concept, amount, status, supplier, date: add(t, d) });
  fin(p1, 'CAPEX', 'Obra civil / construcción', 'Estimación #3 cimentación', 4200000, 'Pagado', 'Constructora Delta', -15);
  fin(p1, 'CAPEX', 'Maquinaria y equipo', 'Grúa viajera 10 t (anticipo)', 1500000, 'Comprometido', 'Grúas MX', -5);
  fin(p1, 'OPEX', 'Renta de maquinaria y equipo', 'Renta retroexcavadora mes', 85000, 'Pagado', 'Rentas Monterrey', -10);
  fin(p1, 'OPEX', 'Mano de obra', 'Supervisión externa', 120000, 'Pagado', 'Supervisa SA', -8);
  fin(p2, 'CAPEX', 'Instalaciones', 'Instalación eléctrica (anticipo 30%)', 450000, 'Pagado', 'Electro Norte', -12);
  fin(p2, 'OPEX', 'Servicios y subcontratos', 'Limpieza de obra', 18000, 'Pagado', 'Limpia Pro', -3);
  fin(p2, 'OPEX', 'Fletes y acarreos', 'Retiro de escombro', 22000, 'Comprometido', 'Acarreos JR', -1);
}
