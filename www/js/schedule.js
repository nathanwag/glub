/* Textos e desenho dos ajustes de lembrete. Puro: o settings.js monta a tela
 * com isto, e os testes rodam sob node. */

import { nudgePoints } from './reminder.js';

// Semana comecando na segunda; o valor e o de Date#getDay.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function daysLabel(days) {
  if (days.length === 7) return 'todos os dias';
  const ordered = WEEK.filter((d) => days.includes(d));
  const first = WEEK.indexOf(ordered[0]);
  const consecutive = ordered.every((d, i) => WEEK.indexOf(d) === first + i);
  if (consecutive && ordered.length >= 3) return `${SHORT[ordered[0]]} a ${SHORT[ordered.at(-1)]}`;
  const names = ordered.map((d) => SHORT[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

export function remindersSummary(config) {
  return `Só se atrasar · das ${config.start} às ${config.end} · ${daysLabel(config.days)}`;
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Posicoes (0 a 1) numa barra de 24 h que comeca na virada do dia. */
export function dayTimeline(config) {
  const origin = toMinutes(config.dayStart ?? '00:00');
  const at = (minutes) => (minutes - origin) / 1440;
  return {
    from: at(toMinutes(config.start)),
    to: at(toMinutes(config.end)),
    // O maximo do dia: quem esta no ritmo nao recebe nenhum.
    reminders: nudgePoints(config).map((p) => at(p.at)),
  };
}
