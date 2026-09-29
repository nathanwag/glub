import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from './api.js';
import { handleCron } from './cron.js';
import { dayOf } from '../../www/js/reminder.js';

const ORIGIN = 'https://water-alert.exemplo.workers.dev';
const TOKEN = 'segredo-do-app';

const config = {
  goalMl: 2000,
  glassMl: 250,
  start: '08:00',
  end: '22:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  tz: 'America/Sao_Paulo',
};
const subscription = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };

function fakeKv() {
  const data = new Map();
  return {
    async get(key, type) {
      const raw = data.get(key) ?? null;
      return type === 'json' && raw !== null ? JSON.parse(raw) : raw;
    },
    async put(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
  };
}

function setup({ pushStatus = 201, pushBody = '' } = {}) {
  const sent = [];
  const deps = {
    kv: fakeKv(),
    token: TOKEN,
    vapidPublicKey: 'BPublica',
    send: async (sub, message) => { sent.push({ sub, message }); return new Response(pushBody, { status: pushStatus }); },
  };
  const call = (method, path, { body, token = TOKEN } = {}) => handleApi(new Request(ORIGIN + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), deps);
  return { call, sent, deps };
}

test('sincronizar guarda a assinatura, e o estado passa a dizer que ha lembretes ativos', async () => {
  const { call } = setup();

  const put = await call('PUT', '/api/sync', { body: { subscription, config } });
  assert.equal(put.status, 204);

  const state = await (await call('GET', '/api/sync')).json();
  assert.equal(state.subscribed, true);
});

test('sem o token certo a API recusa e nao guarda nada', async () => {
  const { call } = setup();

  assert.equal((await call('PUT', '/api/sync', { body: { subscription, config }, token: 'errado' })).status, 401);
  assert.equal((await call('PUT', '/api/sync', { body: { subscription, config }, token: null })).status, 401);

  const state = await (await call('GET', '/api/sync')).json();
  assert.equal(state.subscribed, false);
});

test('config invalida e recusada com a mensagem do problema', async () => {
  const { call } = setup();

  const res = await call('PUT', '/api/sync', {
    body: { subscription, config: { ...config, start: '22:00', end: '08:00' } },
  });

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /fim/i);
  assert.equal((await (await call('GET', '/api/sync')).json()).subscribed, false);
});

test('corpo que nao e JSON e recusado', async () => {
  const res = await handleApi(new Request(`${ORIGIN}/api/sync`, {
    method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body: 'nao e json',
  }), { kv: fakeKv(), token: TOKEN });
  assert.equal(res.status, 400);
});

const at = (local) => new Date(`${local}-03:00`);

test('sincronizar de novo nao apaga o registro do ultimo lembrete enviado', async () => {
  const { call, sent, deps } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await handleCron({ ...deps, now: at('2026-09-22T10:00:00') });

  // Mudou so a meta, sem mandar a assinatura de novo.
  await call('PUT', '/api/sync', { body: { config: { ...config, goalMl: 2500 } } });
  await handleCron({ ...deps, now: at('2026-09-22T10:05:00') });

  assert.equal((await (await call('GET', '/api/sync')).json()).subscribed, true);
  assert.equal(sent.length, 1);
});

test('adiar pelo app faz o cron lembrar de novo em 10 min', async () => {
  const { call, sent, deps } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await handleCron({ ...deps, now: at('2026-09-22T10:00:00') });

  await call('PUT', '/api/sync', { body: { config, snoozedAt: at('2026-09-22T10:01:00').toISOString() } });
  await handleCron({ ...deps, now: at('2026-09-22T10:10:00') });
  assert.equal(sent.length, 1);
  await handleCron({ ...deps, now: at('2026-09-22T10:15:00') });
  assert.equal(sent.length, 2);
});

test('a notificacao abre o app na mesma origem da API', async () => {
  const { call, sent, deps } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await handleCron({ ...deps, now: at('2026-09-22T10:00:00') });

  assert.ok(sent[0].message.notification.navigate.startsWith(`${ORIGIN}/#`));
});

test('desativar os lembretes (assinatura null) esquece a assinatura', async () => {
  const { call } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await call('PUT', '/api/sync', { body: { subscription: null, config } });

  assert.equal((await (await call('GET', '/api/sync')).json()).subscribed, false);
});

test('a chave publica VAPID e servida sem token: o app precisa dela antes de assinar', async () => {
  const { call } = setup();
  const res = await call('GET', '/api/vapid-public-key', { token: null });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).key, 'BPublica');
});

test('testar envia uma notificacao na hora, fora de qualquer horario', async () => {
  const { call, sent } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });

  const res = await call('POST', '/api/test');

  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.web_push, 8030);
  assert.equal(sent[0].message.notification.title, 'Glub');
  assert.equal(sent[0].message.notification.body, 'Faltam 2000 ml pra meta de hoje');
});

test('testar com a meta batida nao fala em numero', async () => {
  const { call, sent } = setup();
  const day = dayOf(new Date(), config.tz, '00:00');
  await call('PUT', '/api/sync', { body: { subscription, config, day, todayMl: 2000 } });

  await call('POST', '/api/test');

  assert.equal(sent[0].message.notification.body, 'Meta batida, mas um gole a mais não faz mal');
});

test('testar sem lembretes ativos avisa que falta ativar', async () => {
  const { call, sent } = setup();
  const res = await call('POST', '/api/test');
  assert.equal(res.status, 404);
  assert.equal(sent.length, 0);
});

test('testar com assinatura expirada a esquece e avisa o app', async () => {
  const { call } = setup({ pushStatus: 410 });
  await call('PUT', '/api/sync', { body: { subscription, config } });

  const res = await call('POST', '/api/test');

  assert.equal(res.status, 410);
  assert.equal((await (await call('GET', '/api/sync')).json()).subscribed, false);
});

test('testar recusado pelo push service mostra o status e o motivo que ele deu', async () => {
  const { call } = setup({ pushStatus: 403, pushBody: '{"reason":"BadJwtToken"}' });
  await call('PUT', '/api/sync', { body: { subscription, config } });

  const res = await call('POST', '/api/test');

  assert.equal(res.status, 502);
  const { error } = await res.json();
  assert.match(error, /403/);
  assert.match(error, /BadJwtToken/);
});
