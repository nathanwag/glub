import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  atLocal, daySummary, history, parseMl,
} from './intake.js';

test('o resumo do dia soma os copos e aponta o ultimo, fora de ordem ou nao', () => {
  const intakes = [
    { id: 2, ml: 300, at: '2026-09-22T14:00:00.000Z' },
    { id: 1, ml: 250, at: '2026-09-22T11:00:00.000Z' },
  ];
  const s = daySummary(intakes, 2000);
  assert.equal(s.totalMl, 550);
  assert.equal(s.lastDrinkAt, '2026-09-22T14:00:00.000Z');
});

test('dia vazio comeca do zero, sem ultimo copo', () => {
  assert.deepEqual(daySummary([], 2000), { totalMl: 0, lastDrinkAt: null, progress: 0, leftMl: 2000 });
});

test('passar da meta enche a barra mas nao transborda, e nao falta nada', () => {
  const s = daySummary([{ id: 1, ml: 2600, at: '2026-09-22T11:00:00.000Z' }], 2000);
  assert.equal(s.progress, 1);
  assert.equal(s.leftMl, 0);
});

test('o progresso e a fracao da meta ja bebida', () => {
  const s = daySummary([{ id: 1, ml: 500, at: '2026-09-22T11:00:00.000Z' }], 2000);
  assert.equal(s.progress, 0.25);
  assert.equal(s.leftMl, 1500);
});

const cup = (day, ml, time = '12:00') => ({ ml, day, at: `${day}T${time}:00.000Z` });

test('o historico lista os ultimos dias em ordem, com zero nos dias sem copo', () => {
  const h = history([cup('2026-09-26', 250), cup('2026-09-26', 500), cup('2026-09-24', 300)], '2026-09-26', 3, 2000);
  assert.deepEqual(h.days, [
    { day: '2026-09-24', totalMl: 300 },
    { day: '2026-09-25', totalMl: 0 },
    { day: '2026-09-26', totalMl: 750 },
  ]);
});

test('a media ignora dias sem registro, e bater a meta e chegar nela', () => {
  const h = history([cup('2026-09-24', 2000), cup('2026-09-26', 1000)], '2026-09-26', 7, 2000);
  assert.equal(h.avgMl, 1500);
  assert.equal(h.daysAtGoal, 1);
});

test('sem nenhum registro a media e zero', () => {
  assert.equal(history([], '2026-09-26', 7, 2000).avgMl, 0);
});

test('a sequencia conta os dias seguidos na meta, sem quebrar por hoje ainda estar em andamento', () => {
  const intakes = [cup('2026-09-21', 2000), cup('2026-09-23', 2000), cup('2026-09-24', 2500), cup('2026-09-25', 2000), cup('2026-09-26', 500)];
  assert.equal(history(intakes, '2026-09-26', 7, 2000).streak, 3);
  assert.equal(history([...intakes, cup('2026-09-26', 1500)], '2026-09-26', 7, 2000).streak, 4);
});

test('a sequencia passa do tamanho da janela do grafico', () => {
  const intakes = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'].map((d) => cup(d, 2000));
  assert.equal(history(intakes, '2026-09-23', 2, 2000).streak, 4);
});

test('um horario local vira o instante UTC certo, mesmo virando o dia em UTC', () => {
  assert.equal(atLocal('2026-09-26', '14:30', 'America/Sao_Paulo'), '2026-09-26T17:30:00.000Z');
  assert.equal(atLocal('2026-09-26', '22:15', 'America/Sao_Paulo'), '2026-09-27T01:15:00.000Z');
});

test('o horario local respeita o horario de verao do dia escolhido', () => {
  assert.equal(atLocal('2026-07-01', '09:00', 'Europe/Lisbon'), '2026-07-01T08:00:00.000Z');
  assert.equal(atLocal('2026-01-15', '09:00', 'Europe/Lisbon'), '2026-01-15T09:00:00.000Z');
});

test('com a virada as 05:00, um horario de madrugada cai na noite seguinte do mesmo dia', () => {
  assert.equal(atLocal('2026-09-26', '01:30', 'America/Sao_Paulo', '05:00'), '2026-09-27T04:30:00.000Z');
  assert.equal(atLocal('2026-09-26', '05:00', 'America/Sao_Paulo', '05:00'), '2026-09-26T08:00:00.000Z');
});

test('quantidade digitada vira ml inteiro', () => {
  assert.equal(parseMl('510'), 510);
});

test('a unidade e o ponto de milhar sao ignorados', () => {
  assert.equal(parseMl('510 ml'), 510);
  assert.equal(parseMl('1.000'), 1000);
});

test('vazio, zero ou sem numero nao e quantidade', () => {
  assert.equal(parseMl(''), null);
  assert.equal(parseMl('0'), null);
  assert.equal(parseMl('ml'), null);
});
