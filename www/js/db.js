/* Unica camada que fala com o IndexedDB.
 *
 * Cuidado com Safari/WebKit: uma transacao e encerrada quando o event loop fica
 * ocioso. Os pedidos sao disparados de forma sincrona dentro da transacao e o
 * `await` acontece do lado de fora — nunca um `await` no meio de uma.
 */

import { DEFAULT_CONFIG, localParts } from './reminder.js';

// Nome do banco NAO muda: IndexedDB e chaveado por (origem, nome), e trocar
// a string abriria um banco novo e vazio.
const DB_NAME = 'gole';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS = {
  ...DEFAULT_CONFIG,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  // Segredo que o Worker exige em /api/*. Digitado uma vez em Ajustes.
  token: '',
  // Perfil da calculadora de meta (hydration.js). Fica so no aparelho:
  // push.serverConfig() so manda os campos de DEFAULT_CONFIG.
  weightKg: null,
  heightCm: null,
  age: null,
  sex: '',
  exerciseMin: null,
  hotClimate: false,
  pregnancy: '',
  // Toque na notificacao (views/today.js): id do ultimo lembrete ja
  // registrado, pra nao contar o mesmo toque duas vezes, e quando adiou.
  lastReminder: '',
  snoozedAt: null,
};

let dbPromise = null;
let settingsCache = { ...DEFAULT_SETTINGS };

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore('settings', { keyPath: 'key' });
        const intakes = db.createObjectStore('intakes', { keyPath: 'id', autoIncrement: true });
        intakes.createIndex('by_day', 'day');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function init() {
  const rows = await tx('settings', 'readonly', (t) => req(t.objectStore('settings').getAll()));
  const saved = Object.fromEntries((await rows).map((r) => [r.key, r.value]));
  settingsCache = { ...DEFAULT_SETTINGS, ...saved };
}

/** Leitura sincrona: as telas leem ajustes o tempo todo. */
export const settings = () => settingsCache;

export async function saveSettings(patch) {
  settingsCache = { ...settingsCache, ...patch };
  await tx('settings', 'readwrite', (t) => {
    const store = t.objectStore('settings');
    for (const [key, value] of Object.entries(patch)) store.put({ key, value });
  });
}

/** Dia (AAAA-MM-DD) de `date` no fuso dos ajustes — o mesmo que o Worker usa. */
export const dayOf = (date = new Date()) => localParts(date, settingsCache.tz).day;

export async function addIntake(ml, at = new Date()) {
  const intake = { ml, at: at.toISOString(), day: dayOf(at) };
  const id = await tx('intakes', 'readwrite', (t) => req(t.objectStore('intakes').add(intake)));
  return { ...intake, id: await id };
}

export async function deleteIntake(id) {
  await tx('intakes', 'readwrite', (t) => { t.objectStore('intakes').delete(id); });
}

export async function intakesOfDay(day = dayOf()) {
  const rows = await tx('intakes', 'readonly', (t) => req(t.objectStore('intakes').index('by_day').getAll(day)));
  return (await rows).sort((a, b) => (a.at < b.at ? 1 : -1));
}
