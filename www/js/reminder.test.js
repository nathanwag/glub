import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG, configError, dayOf, isDue, nextReminder,
} from './reminder.js';

// Sao Paulo e UTC-3 o ano todo (sem horario de verao desde 2019).
const TZ = 'America/Sao_Paulo';
const at = (local) => new Date(`${local}-03:00`);

const config = {
  goalMl: 2000,
  glassMl: 250,
  start: '08:00',
  end: '22:00',
  intervalMin: 60,
  days: [0, 1, 2, 3, 4, 5, 6],
  stopAtGoal: true,
  tz: TZ,
};

test('sem nada registrado hoje, o primeiro lembrete sai no inicio da janela', () => {
  assert.equal(isDue(config, {}, at('2026-09-22T08:00:00')), true);
});

test('fora da janela nao lembra, e o fim da janela ja conta como fora', () => {
  assert.equal(isDue(config, {}, at('2026-09-22T07:59:00')), false);
  assert.equal(isDue(config, {}, at('2026-09-22T22:00:00')), false);
});

test('em dia da semana desligado nao lembra', () => {
  const weekdaysOnly = { ...config, days: [1, 2, 3, 4, 5] };
  // 2026-09-22 e terca; 2026-09-27 e domingo.
  assert.equal(isDue(weekdaysOnly, {}, at('2026-09-22T09:00:00')), true);
  assert.equal(isDue(weekdaysOnly, {}, at('2026-09-27T09:00:00')), false);
});

test('quem acabou de beber so e lembrado depois de um intervalo inteiro', () => {
  const state = { lastDrinkAt: at('2026-09-22T09:30:00').toISOString() };
  assert.equal(isDue(config, state, at('2026-09-22T10:29:00')), false);
  assert.equal(isDue(config, state, at('2026-09-22T10:30:00')), true);
});

test('ignorado o lembrete, o proximo vem um intervalo depois dele', () => {
  const state = {
    lastDrinkAt: at('2026-09-22T08:10:00').toISOString(),
    lastSentAt: at('2026-09-22T09:10:00').toISOString(),
  };
  assert.equal(isDue(config, state, at('2026-09-22T10:05:00')), false);
  assert.equal(isDue(config, state, at('2026-09-22T10:10:00')), true);
});

test('adiar lembra de novo em 10 min, mesmo antes do intervalo acabar', () => {
  const state = {
    lastSentAt: at('2026-09-22T09:00:00').toISOString(),
    snoozedAt: at('2026-09-22T09:02:00').toISOString(),
  };
  assert.equal(isDue(config, state, at('2026-09-22T09:11:00')), false);
  assert.equal(isDue(config, state, at('2026-09-22T09:12:00')), true);
  assert.equal(nextReminder(config, state, at('2026-09-22T09:05:00')), '09:12');
});

test('o adiamento vale uma vez: depois do lembrete adiado, ou de um copo, volta o intervalo', () => {
  const snoozedAt = at('2026-09-22T09:02:00').toISOString();
  const resent = { lastSentAt: at('2026-09-22T09:15:00').toISOString(), snoozedAt };
  assert.equal(isDue(config, resent, at('2026-09-22T09:30:00')), false);
  assert.equal(isDue(config, resent, at('2026-09-22T10:15:00')), true);

  const drank = {
    lastSentAt: at('2026-09-22T09:00:00').toISOString(),
    lastDrinkAt: at('2026-09-22T09:05:00').toISOString(),
    snoozedAt,
  };
  assert.equal(isDue(config, drank, at('2026-09-22T09:15:00')), false);
  assert.equal(isDue(config, drank, at('2026-09-22T10:05:00')), true);
});

test('o ultimo lembrete de ontem nao atrasa o primeiro de hoje', () => {
  const state = { lastSentAt: at('2026-09-21T21:50:00').toISOString() };
  assert.equal(isDue(config, state, at('2026-09-22T08:00:00')), true);
});

test('meta do dia batida para os lembretes, se a opcao estiver ligada', () => {
  const state = { day: '2026-09-22', todayMl: 2000 };
  const now = at('2026-09-22T15:00:00');
  assert.equal(isDue(config, state, now), false);
  assert.equal(isDue({ ...config, stopAtGoal: false }, state, now), true);
});

test('o total de ontem nao conta como meta batida hoje', () => {
  const state = { day: '2026-09-21', todayMl: 3000 };
  assert.equal(isDue(config, state, at('2026-09-22T15:00:00')), true);
});

test('o dia da semana e o do fuso configurado, nao o UTC', () => {
  const sundayOff = { ...config, start: '00:00', end: '23:59', days: [1, 2, 3, 4, 5, 6] };
  // Sabado 22:30 em Sao Paulo ja e domingo em UTC.
  assert.equal(isDue(sundayOff, {}, at('2026-09-26T22:30:00')), true);
});

test('o proximo lembrete e um intervalo depois do ultimo copo', () => {
  const state = { lastDrinkAt: at('2026-09-22T09:30:00').toISOString() };
  assert.equal(nextReminder(config, state, at('2026-09-22T09:45:00')), '10:30');
});

test('com o lembrete ja vencido, o proximo e agora', () => {
  const state = { lastSentAt: at('2026-09-22T09:00:00').toISOString() };
  assert.equal(nextReminder(config, state, at('2026-09-22T10:02:00')), '10:02');
});

test('sem lembrete cabendo antes do fim da janela, nao ha proximo hoje', () => {
  const state = { lastDrinkAt: at('2026-09-22T21:10:00').toISOString() };
  assert.equal(nextReminder(config, state, at('2026-09-22T21:15:00')), null);
});

test('depois do fim da janela nao ha proximo hoje', () => {
  assert.equal(nextReminder(config, {}, at('2026-09-22T22:30:00')), null);
});

test('a configuracao padrao e valida', () => {
  assert.equal(configError({ ...DEFAULT_CONFIG, tz: TZ }), null);
});

test('janela que termina antes de comecar e recusada', () => {
  assert.match(configError({ ...config, start: '22:00', end: '08:00' }), /fim/i);
  assert.match(configError({ ...config, start: '10:00', end: '10:00' }), /fim/i);
});

test('sem nenhum dia marcado e recusada', () => {
  assert.match(configError({ ...config, days: [] }), /dia/i);
});

test('config malformada vinda da rede e recusada sem lancar', () => {
  const broken = [
    null,
    {},
    { ...config, start: '8h' },
    { ...config, end: '25:00' },
    { ...config, intervalMin: 0 },
    { ...config, intervalMin: '60' },
    { ...config, goalMl: -1 },
    { ...config, glassMl: 0 },
    { ...config, days: [7] },
    { ...config, days: 'todos' },
    { ...config, stopAtGoal: 'sim' },
    { ...config, tz: 'Marte/Olympus' },
  ];
  for (const c of broken) assert.notEqual(configError(c), null, JSON.stringify(c));
});

test('o dia vira a meia-noite por padrao', () => {
  assert.equal(dayOf(at('2026-09-22T23:59:00'), TZ), '2026-09-22');
  assert.equal(dayOf(at('2026-09-23T00:30:00'), TZ), '2026-09-23');
});

test('com a virada as 05:00, a madrugada ainda conta no dia anterior', () => {
  assert.equal(dayOf(at('2026-09-23T01:30:00'), TZ, '05:00'), '2026-09-22');
  assert.equal(dayOf(at('2026-09-23T04:59:00'), TZ, '05:00'), '2026-09-22');
  assert.equal(dayOf(at('2026-09-23T05:00:00'), TZ, '05:00'), '2026-09-23');
  // Virada do mes.
  assert.equal(dayOf(at('2026-10-01T02:00:00'), TZ, '05:00'), '2026-09-30');
});

test('os lembretes nao podem comecar antes da virada do dia', () => {
  assert.equal(configError({ ...config, dayStart: '05:00', start: '05:00' }), null);
  assert.match(configError({ ...config, dayStart: '05:00', start: '04:30' }), /virada/i);
});

test('virada do dia invalida e recusada, e ausente (app antigo) vale como meia-noite', () => {
  assert.notEqual(configError({ ...config, dayStart: '5h' }), null);
  assert.equal(configError({ ...config, dayStart: undefined }), null);
});
