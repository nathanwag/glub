/* Helpers de interface compartilhados pelas telas — versao enxuta do ui.js
 * do gym_tracker: HTML seguro, topbar, toast, bottom sheet. */

export const APP_NAME = 'Gole';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Pede ao app.js pra renderizar a rota atual de novo. Evento em vez de import
 *  pra nao criar ciclo de modulos (app.js importa as telas). */
export const refresh = () => window.dispatchEvent(new Event('app:refresh'));

/* ---------- HTML seguro ----------
 * Toda interpolacao e escapada por padrao. raw() injeta HTML de proposito. */

const RAW = Symbol('raw');

export function raw(value) {
  return { [RAW]: String(value) };
}

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(value) {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (typeof value === 'object' && RAW in value) return value[RAW];
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return out;
}

export function node(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}

/* ---------- Topbar ---------- */

export function setTop({ title, back = null, actions = '' }) {
  $('#topbar-title').textContent = title;
  document.title = title === APP_NAME ? APP_NAME : `${title} · ${APP_NAME}`;
  const backEl = $('#topbar-back');
  backEl.hidden = !back;
  backEl.onclick = back ? () => { location.hash = back; } : null;
  $('#topbar-actions').innerHTML = actions;
}

/* ---------- Toast ---------- */

let toastTimer = null;

export function toast(message, ms = 2600) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- Bottom sheet ---------- */

export function openSheet(title, content) {
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body');
  body.innerHTML = '';
  body.append(typeof content === 'string' ? node(`<div>${content}</div>`) : content);
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  return body;
}

export function closeSheet() {
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
}

export function initSheet() {
  $('#sheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close-sheet]')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });
}

/* ---------- Plataforma ---------- */

export function buzz(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sem suporte */ }
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se apresenta como Macintosh; o toque e o que o denuncia.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

export const fmtTime = (iso) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
  .format(new Date(iso));

export const fmtMl = (ml) => `${new Intl.NumberFormat('pt-BR').format(ml)} ml`;
