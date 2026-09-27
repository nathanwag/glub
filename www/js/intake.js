/* Contas do dia sobre os copos registrados. Puro, pra rodar sob node --test. */

import { localParts } from './reminder.js';

export function daySummary(intakes, goalMl) {
  const totalMl = intakes.reduce((sum, i) => sum + i.ml, 0);
  // ISO em UTC ordena como texto.
  const lastDrinkAt = intakes.reduce((max, i) => (max && max > i.at ? max : i.at), null);
  return {
    totalMl,
    lastDrinkAt,
    progress: Math.min(totalMl / goalMl, 1),
    leftMl: Math.max(goalMl - totalMl, 0),
  };
}

/** Soma `n` dias a um dia AAAA-MM-DD. Conta de calendario em UTC, sem fuso. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Os `n` dias terminando em `endDay`, do mais antigo ao mais novo. */
export function history(intakes, endDay, n, goalMl) {
  const totals = new Map();
  for (const i of intakes) totals.set(i.day, (totals.get(i.day) || 0) + i.ml);
  const days = [];
  for (let k = n - 1; k >= 0; k--) {
    const day = addDays(endDay, -k);
    days.push({ day, totalMl: totals.get(day) || 0 });
  }
  const logged = days.filter((d) => d.totalMl > 0);
  // Hoje (endDay) ainda pode chegar na meta: so entra se ja chegou.
  const atGoal = (day) => (totals.get(day) || 0) >= goalMl;
  let streak = 0;
  let day = atGoal(endDay) ? endDay : addDays(endDay, -1);
  while (atGoal(day)) { streak++; day = addDays(day, -1); }
  return {
    streak,
    days,
    // Dia sem copo quase sempre e dia em que o app nao foi usado, nao dia seco.
    avgMl: logged.length ? Math.round(logged.reduce((sum, d) => sum + d.totalMl, 0) / logged.length) : 0,
    daysAtGoal: days.filter((d) => d.totalMl >= goalMl).length,
  };
}

const utcMinutes = (day, minutes) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60000 + minutes;
};

/** Instante (ISO) do horario HH:MM no dia AAAA-MM-DD, no fuso `tz`. */
export function atLocal(day, hhmm, tz) {
  const [h, m] = hhmm.split(':').map(Number);
  const wanted = utcMinutes(day, h * 60 + m);
  // Chuta como se fosse UTC e corrige pelo que o fuso mostra. A segunda volta
  // acerta quando o chute cai do outro lado de uma troca de horario de verao.
  let guess = wanted;
  for (let k = 0; k < 2; k++) {
    const seen = localParts(new Date(guess * 60000), tz);
    guess += wanted - utcMinutes(seen.day, seen.minutes);
  }
  return new Date(guess * 60000).toISOString();
}
