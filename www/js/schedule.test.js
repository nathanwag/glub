import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayTimeline, daysLabel, remindersSummary,
} from './schedule.js';

test('a semana inteira vira "todos os dias", em qualquer ordem', () => {
  assert.equal(daysLabel([3, 0, 1, 2, 4, 5, 6]), 'todos os dias');
});

test('dias seguidos viram um intervalo, com a semana comecando na segunda', () => {
  assert.equal(daysLabel([5, 1, 2, 3, 4]), 'seg a sex');
  assert.equal(daysLabel([2, 3, 4, 5, 6]), 'ter a sáb');
});

test('dias soltos, ou so dois seguidos, viram lista', () => {
  assert.equal(daysLabel([5, 1, 3]), 'seg, qua e sex');
  assert.equal(daysLabel([0, 6]), 'sáb e dom');
  assert.equal(daysLabel([2]), 'ter');
});

const config = {
  goalMl: 2000, start: '08:00', end: '22:00', days: [1, 2, 3, 4, 5], dayStart: '05:00',
};

test('o resumo dos lembretes cabe numa linha: regra, janela e dias', () => {
  assert.equal(remindersSummary(config), 'Só se atrasar · das 08:00 às 22:00 · seg a sex');
});

test('na linha do dia, a janela e a fracao das 24 h contada a partir da virada', () => {
  const t = dayTimeline({ ...config, dayStart: '02:00', start: '08:00', end: '20:00' });
  assert.equal(t.from, 0.25);
  assert.equal(t.to, 0.75);
});

test('a linha do dia marca o meio e a reta final de cada periodo', () => {
  const t = dayTimeline({ ...config, dayStart: '00:00', start: '06:00', end: '21:00' });
  // Manha 09:00 e 11:30, tarde 15:00 e 17:30, noite (18-21) 19:30 e 20:30.
  const minutes = [540, 690, 900, 1050, 1170, 1230];
  assert.deepEqual(t.reminders, minutes.map((m) => m / 1440));
});
