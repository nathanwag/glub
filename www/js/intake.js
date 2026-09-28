/* Contas do dia sobre os copos registrados. Puro, pra rodar sob node --test. */

import { addDays, localParts } from './reminder.js';

export { addDays };

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

/** Instante (ISO) do horario HH:MM no dia AAAA-MM-DD, no fuso `tz`, com o dia
 *  virando as `dayStart`. */
export function atLocal(day, hhmm, tz, dayStart = '00:00') {
  const [h, m] = hhmm.split(':').map(Number);
  // Antes da virada e a madrugada seguinte, que ainda conta em `day`.
  // HH:MM com zero a esquerda ordena como texto.
  const date = hhmm < dayStart ? addDays(day, 1) : day;
  const wanted = utcMinutes(date, h * 60 + m);
  // Chuta como se fosse UTC e corrige pelo que o fuso mostra. A segunda volta
  // acerta quando o chute cai do outro lado de uma troca de horario de verao.
  let guess = wanted;
  for (let k = 0; k < 2; k++) {
    const seen = localParts(new Date(guess * 60000), tz);
    guess += wanted - utcMinutes(seen.day, seen.minutes);
  }
  return new Date(guess * 60000).toISOString();
}

/** Quantidade digitada ("510", "510 ml", "1.000") em ml, ou null se nao ha
 *  quantidade. So digitos contam: o teclado numerico do iPhone nao tem virgula. */
export function parseMl(text) {
  const ml = Number(String(text).replace(/\D/g, ''));
  return ml > 0 ? ml : null;
}

// Limites em minutos locais. Noite e o resto: 18h ate 05h do dia seguinte.
const PERIODS = [
  { id: 'manha', label: 'Manhã', range: '05h às 12h', from: 5 * 60, to: 12 * 60 },
  { id: 'tarde', label: 'Tarde', range: '12h às 18h', from: 12 * 60, to: 18 * 60 },
  { id: 'noite', label: 'Noite', range: '18h às 05h' },
];

const periodOf = (minutes) => PERIODS.find((p) => p.id === 'noite' || (minutes >= p.from && minutes < p.to));

/** Copos do dia agrupados em manha, tarde e noite (sempre os tres), cada um
 *  marcado como 'past', 'now' ou 'future' em relacao a `now`. */
export function byPeriod(intakes, tz, now) {
  const current = PERIODS.indexOf(periodOf(localParts(now, tz).minutes));
  return PERIODS.map(({ id, label, range }, index) => {
    const mine = intakes.filter((i) => periodOf(localParts(new Date(i.at), tz).minutes).id === id)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    const when = index < current ? 'past' : index === current ? 'now' : 'future';
    return { id, label, range, when, totalMl: mine.reduce((sum, i) => sum + i.ml, 0), intakes: mine };
  });
}
