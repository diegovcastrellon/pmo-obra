// Instalación en la pantalla de inicio (PWA).
// Android / Chrome / Edge: usa el diálogo nativo de instalación.
// iPhone / iPad: Apple no permite instalar con un botón, así que se muestran los pasos guiados.
import { openModal, toast } from './app.js';

let deferredPrompt = null;
const DISMISS_KEY = 'pmo-install-dismissed';

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ua = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSSafari = isIOS && !/crios|fxios|edgios/i.test(ua);
const isMobile = isIOS || /android/i.test(ua);

export const canInstall = () => !isStandalone() && (!!deferredPrompt || isIOS || isMobile);

const shareIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;color:#0a84ff"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>`;
const plusIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-3px"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;

export async function installApp() {
  if (isStandalone()) return toast('La app ya está instalada');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideBanner();
    if (outcome === 'accepted') toast('¡Listo! Búscala en tu pantalla de inicio');
    return;
  }
  const steps = isIOS
    ? `${!isIOSSafari ? '<p class="notice">Para instalarla en iPhone, abre esta página en <b>Safari</b>.</p>' : ''}
       <ol class="install-steps">
         <li><span>1</span><div>Toca el botón <b>Compartir</b> ${shareIcon} en la barra de Safari (abajo, o arriba en iPad).</div></li>
         <li><span>2</span><div>Desliza hacia abajo y toca <b>Agregar a inicio</b> ${plusIcon}.</div></li>
         <li><span>3</span><div>Toca <b>Agregar</b>. El ícono de PMO Desk aparecerá en tu pantalla de inicio.</div></li>
       </ol>`
    : `<ol class="install-steps">
         <li><span>1</span><div>Abre el menú del navegador <b>⋮</b> (arriba a la derecha).</div></li>
         <li><span>2</span><div>Toca <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.</div></li>
         <li><span>3</span><div>Confirma con <b>Instalar</b>.</div></li>
       </ol>
       <p class="small muted">En PC: usa el ícono de instalar en la barra de direcciones de Chrome o Edge.</p>`;
  openModal('Instalar PMO Desk', `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px">
      <img src="icons/icon-192.png" alt="" width="56" height="56" style="border-radius:13px;box-shadow:0 2px 8px rgba(0,0,0,.15)">
      <div><b>PMO Desk</b><div class="small muted">Funciona sin internet y se abre a pantalla completa, como cualquier app.</div></div>
    </div>${steps}`, { cancelLabel: 'Entendido' });
}

function showBanner() {
  if (document.getElementById('install-banner') || !canInstall()) return;
  try { if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 7 * 864e5) return; } catch { /* sin almacenamiento */ }
  const el = document.createElement('div');
  el.id = 'install-banner';
  el.className = 'install-banner';
  el.innerHTML = `<img src="icons/icon-192.png" alt="">
    <div class="grow"><b>Instala PMO Desk</b><div class="small muted">Agrégala a tu pantalla de inicio</div></div>
    <button class="btn primary sm" data-install>Instalar</button>
    <button class="btn icon sm" data-dismiss aria-label="Cerrar">✕</button>`;
  el.querySelector('[data-install]').onclick = installApp;
  el.querySelector('[data-dismiss]').onclick = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
    hideBanner();
  };
  document.body.appendChild(el);
}
const hideBanner = () => document.getElementById('install-banner')?.remove();

export function initInstall() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; showBanner(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; hideBanner(); });
  if (isMobile) setTimeout(showBanner, 1500);
}
