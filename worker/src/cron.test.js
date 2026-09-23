import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCron } from './cron.js';

const at = (local) => new Date(`${local}-03:00`);

const config = {
  goalMl: 2000,
  glassMl: 250,
  start: '08:00',
  end: '22:00',
  intervalMin: 60,
  days: [0, 1, 2, 3, 4, 5, 6],
  stopAtGoal: true,
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

  await handleCron({ kv, send, now: at('2026-09-22T08:00:00') });
  await handleCron({ kv, send, now: at('2026-09-22T08:05:00') });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].sub, subscription);
});

test('assinatura expirada (410) e esquecida: as rodadas seguintes nao tentam de novo', async () => {
  const kv = fakeKv({ device: { subscription, config } });
  const gone = fakeSender(410);

  await handleCron({ kv, send: gone.send, now: at('2026-09-22T08:00:00') });
  await handleCron({ kv, send: gone.send, now: at('2026-09-22T10:00:00') });

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

  await handleCron({ kv, send, now: at('2026-09-22T08:00:00') });
  await handleCron({ kv, send, now: at('2026-09-22T08:05:00') });
  await handleCron({ kv, send, now: at('2026-09-22T08:10:00') });
  await handleCron({ kv, send, now: at('2026-09-22T08:15:00') });

  assert.equal(sent.length, 3);
});

test('a notificacao diz quanto falta pra meta e abre o app ao tocar', async () => {
  const appUrl = 'https://water-alert.exemplo.workers.dev/';
  const kv = fakeKv({
    device: { subscription, config, appUrl, day: '2026-09-22', todayMl: 750 },
  });
  const { send, sent } = fakeSender();

  await handleCron({ kv, send, now: at('2026-09-22T08:00:00') });

  // Formato do Declarative Web Push (Safari 18.4+): o iOS mostra a notificacao
  // mesmo que o service worker falhe. Versoes antigas caem no sw.js.
  const { web_push: magic, notification } = sent[0].message;
  assert.equal(magic, 8030);
  assert.match(notification.body, /1250 ml/);
  assert.equal(notification.navigate, appUrl);
});
