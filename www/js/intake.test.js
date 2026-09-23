import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daySummary } from './intake.js';

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
