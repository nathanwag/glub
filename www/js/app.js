/* Bootstrap e roteamento por hash (dispensa config de servidor). */

import * as db from './db.js';
import * as push from './push.js';
import { $, initSheet, closeSheet } from './ui.js';
import * as today from './views/today.js';
import * as settings from './views/settings.js';
import * as goalCalc from './views/goal-calc.js';

const ROUTES = {
  '/': today.render,
  '/ajustes': settings.render,
  '/meta': goalCalc.render,
};

async function route() {
  closeSheet();
  const path = location.hash.replace(/^#/, '') || '/';
  const view = $('#view');
  // Cada tela pendura seus handlers no mesmo #view; os da anterior nao podem sobrar.
  view.onclick = null;
  view.oninput = null;
  view.onchange = null;
  try {
    await (ROUTES[path] || ROUTES['/'])(view);
  } catch (err) {
    console.error(err);
    view.textContent = `Algo deu errado: ${err.message}`;
  }
}

async function boot() {
  await db.init();
  initSheet();

  // O fuso acompanha o aparelho: quem viaja continua sendo lembrado no
  // horario local de onde esta.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (db.settings().tz !== tz) await db.saveSettings({ tz });

  window.addEventListener('hashchange', route);
  window.addEventListener('app:refresh', route);
  // Voltar ao app no dia seguinte tem que mostrar o dia novo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      route();
      push.resync().catch(() => {});
    }
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW', err));
  }

  await route();
  push.resync().catch(() => {});
}

boot();
