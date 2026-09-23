import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateWater } from './hydration.js';

test('so com o peso, estima com os 35 ml/kg de adulto', () => {
  assert.equal(estimateWater({ weightKg: 70 }).totalMl, 2450);
});

test('a idade escolhe os ml por kg: 40 ate 17, 35 ate 55, 30 ate 65, 25 depois', () => {
  const ml = (age) => estimateWater({ weightKg: 60, age }).totalMl;
  assert.equal(ml(17), 2400);
  assert.equal(ml(18), 2100);
  assert.equal(ml(55), 2100);
  assert.equal(ml(56), 1800);
  assert.equal(ml(65), 1800);
  assert.equal(ml(66), 1500);
});

test('sem peso valido nao ha estimativa', () => {
  for (const weightKg of [undefined, null, 0, -5, Number.NaN]) {
    assert.equal(estimateWater({ weightKg }), null, String(weightKg));
  }
});

test('exercicio soma 500 ml por hora, e a conta aparece passo a passo', () => {
  const r = estimateWater({ weightKg: 70, exerciseMin: 45 });
  assert.deepEqual(r.steps.map((s) => s.ml), [2450, 375]);
  assert.match(r.steps[0].label, /70 kg × 35 ml/);
  assert.match(r.steps[1].label, /45 min/);
  // 2825 arredonda pra 2850: meta em multiplos de 50 ml.
  assert.equal(r.totalMl, 2850);
});

test('clima quente soma 500 ml', () => {
  const r = estimateWater({ weightKg: 70, hotClimate: true });
  assert.equal(r.totalMl, 2950);
  assert.equal(estimateWater({ weightKg: 70, hotClimate: false }).totalMl, 2450);
});

test('gestacao soma 300 ml e amamentacao 700 ml, como a EFSA', () => {
  assert.equal(estimateWater({ weightKg: 60, pregnancy: 'pregnant' }).totalMl, 2400);
  assert.equal(estimateWater({ weightKg: 60, pregnancy: 'lactating' }).totalMl, 2800);
  assert.equal(estimateWater({ weightKg: 60, pregnancy: '' }).totalMl, 2100);
});

test('com altura, compara com a superficie corporal (Mosteller x 1500 ml/m2)', () => {
  // sqrt(175 * 70 / 3600) = 1,845 m2 -> 2767 ml -> 2750.
  const r = estimateWater({ weightKg: 70, heightCm: 175 });
  assert.equal(r.compare.find((c) => c.key === 'bsa').ml, 2750);
  assert.equal(estimateWater({ weightKg: 70 }).compare.find((c) => c.key === 'bsa'), undefined);
});

test('com o sexo, compara com a referencia da EFSA: 2,0 L mulheres, 2,5 L homens', () => {
  const efsa = (profile) => estimateWater({ weightKg: 70, ...profile }).compare.find((c) => c.key === 'efsa');
  assert.equal(efsa({ sex: 'f' }).ml, 2000);
  assert.equal(efsa({ sex: 'm' }).ml, 2500);
  assert.equal(efsa({ sex: 'f', pregnancy: 'lactating' }).ml, 2700);
  assert.equal(efsa({}), undefined);
  // Abaixo de 14 anos a EFSA tem outros valores; melhor nao comparar.
  assert.equal(efsa({ sex: 'm', age: 10 }), undefined);
});

test('peso com decimal aparece com virgula e o passo em ml inteiro', () => {
  const r = estimateWater({ weightKg: 72.5 });
  assert.match(r.steps[0].label, /72,5 kg/);
  assert.equal(r.steps[0].ml, 2538);
  assert.equal(r.totalMl, 2550);
});
