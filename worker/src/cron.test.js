import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCron } from './cron.js';

const at = (local) => new Date(`${local}-03:00`);

const config = {
  goalMl: 2000,
  glassMl: 250,
  start: '08:00',
  end: '22:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  tz: 'America/Sao_Paulo',
};

const subscription = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };

function fakeKv(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    async get(key, type) {
      const raw = data.get(key) ?? null;
      return type === 'json' && raw !== null ? JSON.parse(raw) : raw;
    },
    async put(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
  };
}

// O push service e a fronteira externa: o fake so registra o que foi enviado.
function fakeSender(status = 201) {
  const sent = [];
  const send = async (sub, message) => { sent.push({ sub, message }); return { status }; };
  return { send, sent };
}

test('lembrete vencido e enviado, e nao se repete na rodada seguinte', async () => {
  const kv = fakeKv({ device: { subscription, config } });
  const { send, sent } = fakeSender();

  await handleCron({ kv, send, now: at('2026-09-22T10:00:00') });
  await handleCron({ kv, send, now: at('2026-09-22T10:05:00') });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].sub, subscription);
});

test('assinatura expirada (410) e esquecida: as rodadas seguintes nao tentam de novo', async () => {
  const kv = fakeKv({ device: { subscription, config } });
  const gone = fakeSender(410);

  await handleCron({ kv, send: gone.send, now: at('2026-09-22T10:00:00') });
  await handleCron({ kv, send: gone.send, now: at('2026-09-22T11:30:00') });

  assert.equal(gone.sent.length, 1);
});

test('falha passageira do push service tenta de novo na rodada seguinte', async () => {
  const kv = fakeKv({ device: { subscription, config } });
  const sent = [];
  const replies = [
    async () => { throw new Error('rede'); },
    async () => ({ status: 500 }),
    async () => ({ status: 201 }),
  ];
  const send = async (sub, message) => { sent.push(message); return replies[sent.length - 1](); };

  await handleCron({ kv, send, now: at('2026-09-22T10:00:00') });
  await handleCron({ kv, send, now: at('2026-09-22T10:05:00') });
  await handleCron({ kv, send, now: at('2026-09-22T10:10:00') });
  await handleCron({ kv, send, now: at('2026-09-22T10:15:00') });

  assert.equal(sent.length, 3);
});

const appUrl = 'https://water-alert.exemplo.workers.dev/';

async function notificationAt(local, device = {}) {
  const kv = fakeKv({ device: { subscription, config, appUrl, day: '2026-09-22', ...device } });
  const { send, sent } = fakeSender();
  await handleCron({ kv, send, now: at(local) });
  return sent[0].message;
}

test('no meio do periodo, a notificacao diz quanto falta ate o fim dele, sob o nome do app', async () => {
  // Manha 08-12 com 550 ml.
  const message = await notificationAt('2026-09-22T10:00:00', { todayMl: 0 });

  // Formato do Declarative Web Push (Safari 18.4+): o iOS mostra a notificacao
  // mesmo que o service worker falhe. Versoes antigas caem no sw.js.
  assert.equal(message.web_push, 8030);
  assert.equal(message.notification.title, 'Glub');
  assert.equal(message.notification.body, 'Faltam 550 ml até as 12h');
});

test('na reta final, a notificacao e a ultima chamada do periodo', async () => {
  const { notification } = await notificationAt('2026-09-22T11:30:00', { todayMl: 300 });
  assert.equal(notification.title, 'Glub');
  assert.equal(notification.body, 'Última chamada: 250 ml até as 12h');
});

test('o aviso adiado fala do periodo em que sai', async () => {
  const { notification } = await notificationAt('2026-09-22T11:55:00', {
    todayMl: 300,
    lastSentAt: at('2026-09-22T11:30:00').toISOString(),
    snoozedAt: at('2026-09-22T11:45:00').toISOString(),
  });
  assert.equal(notification.body, 'Faltam 250 ml até as 12h');
});

test('tocar na notificacao leva a rota que registra o copo, com um id por lembrete', async () => {
  const kv = fakeKv({ device: { subscription, config, appUrl } });
  const { send, sent } = fakeSender();

  await handleCron({ kv, send, now: at('2026-09-22T10:00:00') });
  await handleCron({ kv, send, now: at('2026-09-22T11:30:00') });

  // O id e o que impede o mesmo toque de registrar dois copos.
  const [first, second] = sent.map((s) => new URL(s.message.notification.navigate));
  assert.equal(first.origin + first.pathname, appUrl);
  assert.match(first.hash, /^#\/bebi\?lembrete=./);
  assert.notEqual(first.hash, second.hash);
});
