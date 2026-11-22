import { app, openModal, closeModal, toast, confirmDialog, projectForm, taskForm, eventForm } from '../app.js';
import { icon, esc, uid, today, fmtDate, fmtMoney, prioChip, options, download } from '../utils.js';
import { audioGet, audioSet, audioDel } from '../db.js';

const STATUS = [
  { v: 'En tiempo', cls: 'ok' },
  { v: 'En riesgo', cls: 'warn' },
  { v: 'Retrasado', cls: 'bad' }
];
const statusChip = s => `<span class="chip ${STATUS.find(x => x.v === s)?.cls || ''}">${esc(s || '—')}</span>`;

let subTab = 'bitacora';

export function render(el, [projectId]) {
  if (projectId && app.project(projectId)) return renderDetail(el, app.project(projectId));
  renderList(el);
}

function lastUpdate(pid) {
  return app.state.updates.filter(u => u.projectId === pid).sort((a, b) => b.date.localeCompare(a.date))[0];
}

function renderList(el) {
  const { projects } = app.state;
  const todayStr = today();
  const pending = projects.filter(p => p.status === 'Activo' && lastUpdate(p.id)?.date !== todayStr);
  el.innerHTML = `
    <div class="page-head">
      <h1>Proyectos</h1>
      <button class="btn primary" data-new>${icon('plus')} Nuevo proyecto</button>
    </div>
    ${pending.length ? `<div class="notice">
      <b>Actualización diaria pendiente:</b> ${pending.map(p => `<a href="#proyectos/${p.id}">${esc(p.name)}</a>`).join(', ')}</div>` : ''}
    ${projects.length ? `<div class="grid grid-3">${projects.map(card).join('')}</div>` :
      `<div class="card empty">Aún no tienes proyectos.<br><br><button class="btn primary" data-new>Crear el primero</button></div>`}`;
  el.querySelectorAll('[data-new]').forEach(b => b.onclick = () => projectForm());
  el.querySelectorAll('[data-open]').forEach(c => c.onclick = () => app.go(`proyectos/${c.dataset.open}`));
}

function card(p) {
  const u = lastUpdate(p.id);
  const open = app.state.tasks.filter(t => t.projectId === p.id && t.status !== 'Hecha').length;
  return `<div class="card project-card" data-open="${p.id}" style="--pc:${esc(p.color)}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
      <h3>${esc(p.name)}</h3>${statusChip(u?.status)}
    </div>
    <div class="muted small">${esc(p.client || '')}${p.status !== 'Activo' ? ` · ${esc(p.status)}` : ''}</div>
    <div style="margin:10px 0 4px" class="small">Avance ${u?.progress ?? 0}%</div>
    <div class="progress"><div style="width:${u?.progress ?? 0}%"></div></div>
    <div class="muted small" style="margin-top:8px">Última actualización: ${u ? fmtDate(u.date) : 'ninguna'} · ${open} tareas abiertas</div>
  </div>`;
}

function renderDetail(el, p) {
  const u = lastUpdate(p.id);
  el.innerHTML = `
    <div class="page-head">
      <div><a href="#proyectos" class="small">← Proyectos</a><h1 style="display:flex;gap:8px;align-items:center">
        <span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</h1>
        <div class="muted small">${esc(p.client || '')} ${p.manager ? '· ' + esc(p.manager) : ''} · ${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</div></div>
      <div class="toolbar">
        <button class="btn" data-edit>${icon('edit')} Editar</button>
        <a class="btn" href="#cronograma/${p.id}">${icon('gantt')} Cronograma</a>
        <a class="btn" href="#finanzas/${p.id}">${icon('money')} Finanzas</a>
      </div>
    </div>
    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="card stat"><div class="l">Avance</div><div class="v">${u?.progress ?? 0}%</div></div>
      <div class="card stat"><div class="l">Estatus</div><div class="v" style="font-size:1rem;margin-top:6px">${statusChip(u?.status)}</div></div>
      <div class="card stat"><div class="l">Presupuesto OPEX</div><div class="v">${fmtMoney(p.budgetOpex)}</div></div>
      <div class="card stat"><div class="l">Presupuesto CAPEX</div><div class="v">${fmtMoney(p.budgetCapex)}</div></div>
    </div>
    <div class="tabs">
      ${[['bitacora', 'Bitácora diaria'], ['minutas', 'Minutas'], ['tareas', 'Tareas'], ['compromisos', 'Compromisos']]
        .map(([k, l]) => `<button data-sub="${k}" class="${subTab === k ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div id="sub"></div>`;
  el.querySelector('[data-edit]').onclick = () => projectForm(p);
  el.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { subTab = b.dataset.sub; renderDetail(el, p); });
  const sub = el.querySelector('#sub');
  ({ bitacora: renderUpdates, minutas: renderMinutes, tareas: renderTasks, compromisos: renderEvents })[subTab](sub, p);
}

// ---------- Bitácora diaria ----------
function renderUpdates(el, p) {
  const list = app.state.updates.filter(u => u.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px"><button class="btn primary" data-new>${icon('plus')} Actualización de hoy</button></div>
    ${list.length ? list.map(u => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <b>${fmtDate(u.date)}</b>
          <div class="toolbar">${statusChip(u.status)}<span class="chip">${u.progress}%</span>
            <button class="btn sm" data-edit="${u.id}">Editar</button></div>
        </div>
        ${u.done ? `<h3 style="margin-top:10px">Avance del día</h3><div style="white-space:pre-wrap">${esc(u.done)}</div>` : ''}
        ${u.issues ? `<h3 style="margin-top:10px">Problemas / riesgos</h3><div style="white-space:pre-wrap">${esc(u.issues)}</div>` : ''}
        ${u.next ? `<h3 style="margin-top:10px">Siguientes pasos</h3><div style="white-space:pre-wrap">${esc(u.next)}</div>` : ''}
        ${u.weather || u.crew ? `<div class="muted small" style="margin-top:8px">${u.weather ? '' + esc(u.weather) : ''} ${u.crew ? '' + esc(u.crew) + ' personas' : ''}</div>` : ''}
      </div>`).join('') : '<div class="card empty">Sin actualizaciones registradas.</div>'}`;
  el.querySelector('[data-new]').onclick = () => updateForm(p);
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => updateForm(p, app.state.updates.find(u => u.id === b.dataset.edit)));
}

function updateForm(p, upd) {
  const prev = lastUpdate(p.id);
  const u = upd || { date: today(), progress: prev?.progress ?? 0, status: prev?.status || 'En tiempo' };
  openModal(upd ? 'Editar actualización' : 'Actualización diaria', `
    <div class="row">
      <label>Fecha<input type="date" name="date" value="${esc(u.date)}"></label>
      <label>Avance físico %<input type="number" min="0" max="100" name="progress" value="${esc(u.progress)}"></label>
      <label>Estatus<select name="status">${options(STATUS.map(s => ({ v: s.v, label: s.v })), u.status)}</select></label>
    </div>
    <label>Avance del día<textarea name="done" placeholder="Actividades ejecutadas, frentes de trabajo…">${esc(u.done)}</textarea></label>
    <label>Problemas / riesgos / restricciones<textarea name="issues">${esc(u.issues)}</textarea></label>
    <label>Siguientes pasos<textarea name="next">${esc(u.next)}</textarea></label>
    <div class="row">
      <label>Clima<input name="weather" value="${esc(u.weather)}"></label>
      <label>Personal en obra<input type="number" name="crew" value="${esc(u.crew)}"></label>
    </div>`, {
    extraFooter: upd ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Eliminar</button>' : '',
    onOpen: f => f.querySelector('[data-del]')?.addEventListener('click', () => {
      if (!confirmDialog('¿Eliminar esta actualización?')) return;
      app.state.updates = app.state.updates.filter(x => x.id !== upd.id); closeModal(); app.commit();
    }),
    onSubmit: d => {
      const data = { ...d, progress: Math.max(0, Math.min(100, Number(d.progress) || 0)) };
      if (upd) Object.assign(upd, data);
      else app.state.updates.push({ id: uid(), projectId: p.id, ...data });
      app.commit(); toast('Actualización registrada');
    }
  });
}

// ---------- Minutas con grabadora ----------
function renderMinutes(el, p) {
  const list = app.state.minutes.filter(m => m.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px"><button class="btn primary" data-new>${icon('mic')} Nueva minuta</button></div>
    ${list.length ? list.map(m => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div><b>${esc(m.title || 'Junta')}</b> <span class="muted small">· ${fmtDate(m.date)}</span></div>
          <div class="toolbar">
            ${m.audioId ? '<span class="chip">audio</span>' : ''}
            <button class="btn sm" data-txt="${m.id}">Texto</button>
            <button class="btn sm" data-edit="${m.id}">Abrir</button>
          </div>
        </div>
        ${m.attendees ? `<div class="muted small" style="margin-top:4px">Asistentes: ${esc(m.attendees)}</div>` : ''}
        ${(m.agreements || []).length ? `<ul style="margin:8px 0 0;padding-left:18px">${m.agreements.map(a =>
          `<li>${esc(a.text)} <span class="muted small">— ${esc(a.owner || 's/r')} · ${fmtDate(a.due)}</span></li>`).join('')}</ul>` : ''}
      </div>`).join('') : '<div class="card empty">Sin minutas. Graba tu próxima junta y registra acuerdos.</div>'}`;
  el.querySelector('[data-new]').onclick = () => minuteForm(p);
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => minuteForm(p, app.state.minutes.find(m => m.id === b.dataset.edit)));
  el.querySelectorAll('[data-txt]').forEach(b => b.onclick = () => exportMinute(p, app.state.minutes.find(m => m.id === b.dataset.txt)));
}

function exportMinute(p, m) {
  const lines = [
    `MINUTA DE JUNTA`, `Proyecto: ${p.name}`, `Tema: ${m.title || ''}`, `Fecha: ${fmtDate(m.date)} ${m.time || ''}`,
    `Asistentes: ${m.attendees || ''}`, '', 'PUNTOS TRATADOS / NOTAS', m.notes || '', '',
    'ACUERDOS Y COMPROMISOS',
    ...(m.agreements || []).map((a, i) => `${i + 1}. ${a.text} — Responsable: ${a.owner || 's/r'} — Fecha: ${fmtDate(a.due)}`),
    '', 'TRANSCRIPCIÓN', m.transcript || ''
  ];
  download(`Minuta ${p.name} ${m.date}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
}

function minuteForm(p, existing) {
  const m = existing ? structuredClone(existing) : { id: uid(), projectId: p.id, date: today(), time: new Date().toTimeString().slice(0, 5), agreements: [], transcript: '' };
  let recorder = null, recognition = null, chunks = [], newAudio = null, interim = '', recStart = 0, timer = null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const agreementRow = (a, i) => `
    <div class="row" data-ag="${i}" style="align-items:end;margin-bottom:6px">
      <label style="flex:3;margin:0">Acuerdo<input data-f="text" value="${esc(a.text)}"></label>
      <label style="margin:0">Responsable<input data-f="owner" value="${esc(a.owner)}"></label>
      <label style="margin:0">Fecha<input type="date" data-f="due" value="${esc(a.due)}"></label>
      <label style="margin:0;flex:0 0 auto;min-width:0" title="Crear tarea y verla en Prioridades/Agenda">
        Tarea<input type="checkbox" data-f="toTask" ${a.taskId ? 'checked disabled' : a.toTask ? 'checked' : ''} style="width:20px;height:20px;display:block"></label>
      <button type="button" class="btn icon danger" data-rm="${i}" style="flex:0 0 auto;min-width:0">${icon('x')}</button>
    </div>`;

  const form = openModal(existing ? 'Minuta de junta' : 'Nueva minuta de junta', `
    <div class="row">
      <label style="flex:2">Tema<input name="title" value="${esc(m.title)}" placeholder="Ej. Junta semanal de avance"></label>
      <label>Fecha<input type="date" name="date" value="${esc(m.date)}"></label>
      <label>Hora<input type="time" name="time" value="${esc(m.time)}"></label>
    </div>
    <label>Asistentes<input name="attendees" value="${esc(m.attendees)}" placeholder="Nombres separados por coma"></label>
    <div class="card" style="background:var(--surface-2);box-shadow:none">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn" data-rec>Grabar</button>
        <span data-status class="small muted">${SR ? 'Graba el audio y transcribe en tiempo real.' : 'Este navegador no transcribe; se guardará solo el audio. Usa Chrome o Safari actualizado para transcribir.'}</span>
      </div>
      <div data-player style="margin-top:8px"></div>
    </div>
    <label>Transcripción<textarea name="transcript" data-transcript style="min-height:120px">${esc(m.transcript)}</textarea></label>
    <label>Puntos tratados / notas<textarea name="notes">${esc(m.notes)}</textarea></label>
    <h3>Acuerdos y compromisos</h3>
    <div data-agreements>${m.agreements.map(agreementRow).join('')}</div>
    <button type="button" class="btn sm" data-add-ag>${icon('plus')} Agregar acuerdo</button>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" name="toCalendar" style="width:auto" ${existing?.eventId ? 'checked disabled' : ''}>
      Registrar esta junta en el calendario</label>`, {
    submitLabel: 'Guardar minuta',
    extraFooter: existing ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Eliminar</button>' : '',
    onSubmit: async d => {
      await stopRecording();
      d.transcript = transcriptEl.value;
      readAgreements();
      Object.assign(m, { title: d.title, date: d.date, time: d.time, attendees: d.attendees, notes: d.notes, transcript: d.transcript });
      if (newAudio) {
        if (m.audioId) await audioDel(m.audioId);
        m.audioId = uid();
        await audioSet(m.audioId, newAudio);
      }
      // Acuerdos marcados → tareas
      let created = 0;
      m.agreements = m.agreements.filter(a => a.text.trim());
      for (const a of m.agreements) {
        if (a.toTask && !a.taskId) {
          a.taskId = uid();
          app.state.tasks.push({ id: a.taskId, projectId: p.id, title: a.text, owner: a.owner, due: a.due || today(), priority: 2,
            estimate: 1, status: 'Pendiente', source: `Minuta ${m.date}`, createdAt: today() });
          created++;
        }
        delete a.toTask;
      }
      if (d.toCalendar === 'on' && !m.eventId) {
        m.eventId = uid();
        const [h, mi] = (m.time || '10:00').split(':').map(Number);
        const end = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
        app.state.events.push({ id: m.eventId, title: m.title || 'Junta', date: m.date, start: m.time || '10:00', end, projectId: p.id, notes: 'Minuta registrada' });
      }
      const idx = app.state.minutes.findIndex(x => x.id === m.id);
      if (idx >= 0) app.state.minutes[idx] = m; else app.state.minutes.push(m);
      app.commit();
      toast(created ? `Minuta guardada · ${created} tarea(s) creadas` : 'Minuta guardada');
    }
  });

  const $ = s => form.querySelector(s);
  const transcriptEl = $('[data-transcript]');
  const statusEl = $('[data-status]');
  const recBtn = $('[data-rec]');

  function readAgreements() {
    form.querySelectorAll('[data-ag]').forEach(row => {
      const a = m.agreements[Number(row.dataset.ag)];
      row.querySelectorAll('[data-f]').forEach(inp => { a[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; });
    });
  }
  function redrawAgreements() { $('[data-agreements]').innerHTML = m.agreements.map(agreementRow).join(''); }
  $('[data-add-ag]').onclick = () => { readAgreements(); m.agreements.push({ text: '', owner: '', due: today(), toTask: true }); redrawAgreements(); };
  $('[data-agreements]').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    readAgreements(); m.agreements.splice(Number(rm.dataset.rm), 1); redrawAgreements();
  });
  $('[data-del]')?.addEventListener('click', async () => {
    if (!confirmDialog('¿Eliminar esta minuta y su audio?')) return;
    if (m.audioId) await audioDel(m.audioId);
    app.state.minutes = app.state.minutes.filter(x => x.id !== m.id);
    closeModal(); app.commit();
  });

  async function showPlayer(blob) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    $('[data-player]').innerHTML = `<audio controls src="${url}" style="width:100%"></audio>
      <button type="button" class="btn sm" data-dl-audio style="margin-top:6px">Descargar audio</button>`;
    $('[data-dl-audio]').onclick = () => download(`Junta ${m.date}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, blob);
  }
  if (m.audioId) audioGet(m.audioId).then(showPlayer);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) { toast('El micrófono requiere HTTPS o localhost'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast('Permiso de micrófono denegado'); return; }
    chunks = [];
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => window.MediaRecorder?.isTypeSupported?.(t));
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      newAudio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      showPlayer(newAudio);
    };
    recorder.start(1000);
    recStart = Date.now();
    recBtn.textContent = 'Detener'; recBtn.classList.add('rec');
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      statusEl.innerHTML = `<span class="rec-indicator">Grabando ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span>
        ${interim ? `<span class="muted"> · ${esc(interim.slice(-80))}</span>` : ''}`;
    }, 500);
    if (SR) startRecognition();
  }

  function startRecognition() {
    recognition = new SR();
    recognition.lang = 'es-MX';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = e => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) transcriptEl.value += (transcriptEl.value && !transcriptEl.value.endsWith('\n') ? ' ' : '') + text.charAt(0).toUpperCase() + text.slice(1) + '.';
          transcriptEl.scrollTop = transcriptEl.scrollHeight;
        } else interim += r[0].transcript;
      }
    };
    // El reconocimiento se corta solo tras silencios: reiniciar mientras se graba.
    recognition.onend = () => { if (recorder?.state === 'recording') { try { recognition.start(); } catch { /* ya activo */ } } };
    recognition.onerror = e => { if (e.error === 'not-allowed') toast('Transcripción no permitida en este navegador'); };
    try { recognition.start(); } catch { /* ignorar */ }
  }

  // Devuelve una promesa que se cumple cuando el audio ya quedó guardado en memoria.
  function stopRecording() {
    clearInterval(timer);
    if (recognition) { const r = recognition; recognition = null; r.onend = null; try { r.stop(); } catch { /* ignorar */ } }
    const wasRecording = recorder?.state === 'recording';
    const done = new Promise(res => {
      if (!wasRecording) return res();
      recorder.addEventListener('stop', () => res(), { once: true });
      recorder.stop();
    });
    if (wasRecording) {
      recBtn.textContent = 'Grabar de nuevo'; recBtn.classList.remove('rec');
      statusEl.textContent = 'Grabación detenida. Revisa la transcripción y agrega acuerdos.';
    }
    return done;
  }

  recBtn.onclick = () => (recorder?.state === 'recording' ? stopRecording() : startRecording());
  document.getElementById('modal').addEventListener('close', stopRecording, { once: true });
}

// ---------- Tareas del proyecto ----------
function renderTasks(el, p) {
  const list = app.state.tasks.filter(t => t.projectId === p.id)
    .sort((a, b) => (a.status === 'Hecha') - (b.status === 'Hecha') || a.priority - b.priority || (a.due || '').localeCompare(b.due || ''));
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px"><button class="btn primary" data-new>${icon('plus')} Nueva tarea</button></div>
    <div class="card">${list.length ? `<div class="list">${list.map(t => `
      <div class="item ${t.status === 'Hecha' ? 'done' : ''}">
        <input type="checkbox" data-done="${t.id}" ${t.status === 'Hecha' ? 'checked' : ''}>
        <div class="grow" data-edit="${t.id}" style="cursor:pointer">
          <div class="title">${esc(t.title)}</div>
          <div class="muted small">${t.owner ? esc(t.owner) + ' · ' : ''}Compromiso ${fmtDate(t.due)} · ${t.estimate} h · ${esc(t.status)}${t.source ? ' · ' + esc(t.source) : ''}</div>
        </div>
        ${prioChip(t.priority)}
      </div>`).join('')}</div>` : '<div class="empty">Sin tareas.</div>'}</div>`;
  el.querySelector('[data-new]').onclick = () => taskForm(null, { projectId: p.id });
  bindTaskList(el);
}

export function bindTaskList(el) {
  el.querySelectorAll('[data-done]').forEach(cb => cb.onchange = () => {
    const t = app.state.tasks.find(x => x.id === cb.dataset.done);
    t.status = cb.checked ? 'Hecha' : 'Pendiente';
    t.doneAt = cb.checked ? today() : undefined;
    app.commit();
  });
  el.querySelectorAll('[data-edit]').forEach(d => d.onclick = () => {
    const t = app.state.tasks.find(x => x.id === d.dataset.edit);
    if (t) taskForm(t);
  });
}

// ---------- Compromisos del proyecto ----------
function renderEvents(el, p) {
  const list = app.state.events.filter(e => e.projectId === p.id).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px"><button class="btn primary" data-new>${icon('plus')} Nuevo compromiso</button></div>
    <div class="card">${list.length ? `<div class="list">${list.map(e => `
      <div class="item" data-ev="${e.id}" style="cursor:pointer">
        <div class="grow"><div class="title">${esc(e.title)}</div>
        <div class="muted small">${fmtDate(e.date)} · ${esc(e.start || '')}–${esc(e.end || '')} ${e.location ? '· ' + esc(e.location) : ''}</div></div>
      </div>`).join('')}</div>` : '<div class="empty">Sin compromisos.</div>'}</div>`;
  el.querySelector('[data-new]').onclick = () => eventForm(null, { projectId: p.id });
  el.querySelectorAll('[data-ev]').forEach(d => d.onclick = () => eventForm(app.state.events.find(e => e.id === d.dataset.ev)));
}
