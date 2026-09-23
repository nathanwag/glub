/* Conversa com o Worker (mesma origem, /api/*) e com o PushManager.
 *
 * O iPhone so entrega Web Push a app instalado na Tela de Inicio, e so deixa
 * pedir permissao dentro de um toque do usuario: enable() tem que ser chamado
 * direto do handler do clique, com requestPermission() antes de qualquer await.
 */

import * as db from './db.js';
import { daySummary } from './intake.js';
import { DEFAULT_CONFIG } from './reminder.js';

export const pushSupported = () => 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

async function api(method, path, body) {
  const res = await fetch(`./api/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${db.settings().token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Erro ${res.status} no servidor.`;
    try { message = (await res.json()).error || message; } catch { /* corpo vazio */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** So os campos que o Worker entende (e valida); o token fica no aparelho. */
function serverConfig(settings) {
  const config = { tz: settings.tz };
  for (const key of Object.keys(DEFAULT_CONFIG)) config[key] = settings[key];
  return config;
}

/** Manda ajustes e o resumo de hoje pro Worker. `extra.subscription` liga
 *  (objeto) ou desliga (null) os lembretes; ausente, mantem como esta. */
export async function sync(extra = {}) {
  const settings = db.settings();
  if (!settings.token) return;
  const day = db.dayOf();
  const { totalMl, lastDrinkAt } = daySummary(await db.intakesOfDay(day), settings.goalMl);
  await api('PUT', 'sync', {
    config: serverConfig(settings), lastDrinkAt, todayMl: totalMl, day, snoozedAt: settings.snoozedAt, ...extra,
  });
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  // getRegistration e nao `ready`: `ready` nunca resolve se o SW nao instalou,
  // e as telas que perguntam isto ficariam em branco pra sempre.
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const fromBase64Url = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export async function enable() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notificações negadas. Libere em Ajustes do iPhone › Notificações › Gole.');
  }
  const { key } = await api('GET', 'vapid-public-key');
  if (!(await navigator.serviceWorker.getRegistration())) {
    throw new Error('O app ainda não terminou de instalar. Feche e abra de novo.');
  }
  // Com registro existente, `ready` resolve assim que o SW ativar.
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) });
  await sync({ subscription: sub.toJSON() });
}

export async function disable() {
  const sub = await currentSubscription();
  await sync({ subscription: null });
  await sub?.unsubscribe();
}

export const sendTest = () => api('POST', 'test');

export const serverStatus = () => api('GET', 'sync');

/** Na abertura do app: reenvia a assinatura atual. Cobre o caso do Worker ter
 *  esquecido uma assinatura que o iOS trocou por outra. */
export async function resync() {
  const sub = await currentSubscription();
  await sync(sub ? { subscription: sub.toJSON() } : {});
}
