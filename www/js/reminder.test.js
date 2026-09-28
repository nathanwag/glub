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
  days: [0, 1, 2, 3, 4, 5, 6],
  tz: TZ,
};

// Com a janela 08-22 e 2000 ml: manha 08-12 (550 ml), tarde 12-18 (1450
// acumulado) e noite 18-22 (2000). Cada periodo avisa no meio e 45 min antes
// do fim, e so se estiver atrasado.
test('sem beber nada, o primeiro aviso sai no meio da manha, nao no inicio da janela', () => {
  assert.equal(isDue(config, {}, at('2026-09-22T08:00:00')), false);
  assert.equal(isDue(config, {}, at('2026-09-22T09:59:00')), false);
  assert.equal(isDue(config, {}, at('2026-09-22T10:00:00')), true);
});

test('no meio do periodo, so avisa quem esta abaixo do ritmo da meta do periodo', () => {
  // Metade da manha: 275 ml de 550.
  const now = at('2026-09-22T10:00:00');
  assert.equal(isDue(config, { day: '2026-09-22', todayMl: 250 }, now), true);
  assert.equal(isDue(config, { day: '2026-09-22', todayMl: 300 }, now), false);
});

test('na reta final, so avisa quem ainda nao fechou o periodo', () => {
  const now = at('2026-09-22T11:15:00');
  assert.equal(isDue(config, { day: '2026-09-22', todayMl: 500 }, now), true);
  assert.equal(isDue(config, { day: '2026-09-22', todayMl: 550 }, now), false);
});

test('o atraso da manha passa pra tarde: a meta e acumulada', () => {
  // Meio da tarde (15:00): 550 + metade de 900 = 1000 ml.
  const now = at('2026-09-22T15:00:00');
  assert.equal(isDue(config, { day: '2026-09-22', todayMl: 950 }, now), true);
  assert.equal(isDue(config, { day: '2026-09-22', todayMl: 1000 }, now), false);
});

test('cada momento avisa uma vez so: enviado o do meio, o proximo e a reta final', () => {
  const state = { lastSentAt: at('2026-09-22T10:00:00').toISOString() };
  assert.equal(isDue(config, state, at('2026-09-22T10:05:00')), false);
  assert.equal(isDue(config, state, at('2026-09-22T11:10:00')), false);
  assert.equal(isDue(config, state, at('2026-09-22T11:15:00')), true);
});

test('o ultimo aviso de ontem nao segura o primeiro de hoje', () => {
  const state = { lastSentAt: at('2026-09-21T21:15:00').toISOString() };
  assert.equal(isDue(config, state, at('2026-09-22T10:00:00')), true);
});

test('adiar lembra de novo em 10 min, fora dos momentos de aviso', () => {
  const state = {
    lastSentAt: at('2026-09-22T10:00:00').toISOString(),
    snoozedAt: at('2026-09-22T10:02:00').toISOString(),
  };
  assert.equal(isDue(config, state, at('2026-09-22T10:11:00')), false);
  assert.equal(isDue(config, state, at('2026-09-22T10:12:00')), true);
});

test('o adiamento vale uma vez: depois do aviso adiado, ou de um copo, voltam os momentos', () => {
  const snoozedAt = at('2026-09-22T10:02:00').toISOString();
  const resent = { lastSentAt: at('2026-09-22T10:12:00').toISOString(), snoozedAt };
  assert.equal(isDue(config, resent, at('2026-09-22T10:30:00')), false);

  const drank = {
    lastSentAt: at('2026-09-22T10:00:00').toISOString(),
    lastDrinkAt: at('2026-09-22T10:05:00').toISOString(),
    snoozedAt,
  };
  assert.equal(isDue(config, drank, at('2026-09-22T10:15:00')), false);
});

test('fora da janela nao lembra, e o fim da janela ja conta como fora', () => {
  assert.equal(isDue(config, {}, at('2026-09-22T07:59:00')), false);
  assert.equal(isDue(config, {}, at('2026-09-22T22:00:00')), false);
});

test('em dia da semana desligado nao lembra', () => {
  const weekdaysOnly = { ...config, days: [1, 2, 3, 4, 5] };
  // 2026-09-22 e terca; 2026-09-27 e domingo.
  assert.equal(isDue(weekdaysOnly, {}, at('2026-09-22T10:00:00')), true);
  assert.equal(isDue(weekdaysOnly, {}, at('2026-09-27T10:00:00')), false);
});

test('com a meta do dia batida, nenhum aviso sai', () => {
  const state = { day: '2026-09-22', todayMl: 2000 };
  assert.equal(isDue(config, state, at('2026-09-22T21:15:00')), false);
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

test('o proximo lembrete e o proximo momento em que, sem beber mais, voce estaria atrasado', () => {
  const day = '2026-09-22';
  assert.equal(nextReminder(config, {}, at('2026-09-22T09:00:00')), '10:00');
  // No ritmo da manha (275), mas sem fechar os 550.
  assert.equal(nextReminder(config, { day, todayMl: 300 }, at('2026-09-22T09:00:00')), '11:15');
  // Manha fechada: o proximo e o meio da tarde (1000).
  assert.equal(nextReminder(config, { day, todayMl: 550 }, at('2026-09-22T10:30:00')), '15:00');
});

test('com o aviso ja vencido e nao enviado, o proximo e agora', () => {
  assert.equal(nextReminder(config, {}, at('2026-09-22T10:02:00')), '10:02');
});

test('com o aviso adiado, o proximo e o fim do adiamento', () => {
  const state = {
    lastSentAt: at('2026-09-22T10:00:00').toISOString(),
    snoozedAt: at('2026-09-22T10:02:00').toISOString(),
  };
  assert.equal(nextReminder(config, state, at('2026-09-22T10:05:00')), '10:12');
});

test('com a meta batida, ou depois da janela, nao ha proximo hoje', () => {
  assert.equal(nextReminder(config, { day: '2026-09-22', todayMl: 2000 }, at('2026-09-22T12:00:00')), null);
  assert.equal(nextReminder(config, {}, at('2026-09-22T22:30:00')), null);
});

test('a configuracao padrao e valida', () => {
  assert.equal(configError({ ...DEFAULT_CONFIG, tz: TZ }), null);
});

test('config sem intervalo e valida: os avisos saem por periodo', () => {
  assert.equal(configError(config), null);
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
    { ...config, goalMl: -1 },
    { ...config, glassMl: 0 },
    { ...config, days: [7] },
    { ...config, days: 'todos' },
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
