/* Regra dos lembretes. Puro e sem dependencias: o app importa daqui pra
 * mostrar o proximo lembrete, e o Worker importa o MESMO arquivo pra decidir
 * quando enviar — as duas pontas nao podem discordar. */

// days usa a numeracao de Date#getDay (0 = domingo). tz fica de fora: quem
// cria a config preenche com o fuso do aparelho.
export const DEFAULT_CONFIG = {
  goalMl: 2000,
  glassMl: 250,
  start: '08:00',
  end: '22:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  // Hora em que o dia vira (dayOf). Config sem ela, de app antigo, vale 00:00.
  dayStart: '00:00',
};

// "Adiar" da tela aberta pela notificacao. O cron roda de 5 em 5 min, entao o
// lembrete adiado chega entre 10 e 15 min depois.
export const SNOOZE_MIN = 10;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Data, dia da semana (0 = domingo) e minutos desde a meia-noite de `date`
 *  vistos no fuso `tz`. O Worker roda em UTC, entao nada aqui pode usar os
 *  getters locais de Date. */
export function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Soma `n` dias a um dia AAAA-MM-DD. Conta de calendario em UTC, sem fuso. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dia (AAAA-MM-DD) a que `date` pertence no fuso `tz`, com o dia virando as
 *  `dayStart` (HH:MM): antes disso, a madrugada ainda conta no dia anterior. */
export function dayOf(date, tz, dayStart = '00:00') {
  const { day, minutes } = localParts(date, tz);
  return minutes < toMinutes(dayStart) ? addDays(day, -1) : day;
}

const pad = (n) => String(n).padStart(2, '0');
const toHHMM = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// Cortes de manha, tarde e noite, os mesmos do byPeriod (intake.js). A janela
// dos lembretes recorta esses periodos.
const PERIODS = [['manhã', 12 * 60], ['tarde', 18 * 60], ['noite', 24 * 60]];
const FINAL_CALL_MIN = 30;

/** Momentos do dia em que um aviso pode sair: o meio e a reta final de cada
 *  periodo da janela, em minutos desde a meia-noite. `needMl` e quanto ja
 *  devia ter sido bebido ali. A meta se divide pelas horas de cada periodo e
 *  e acumulada, entao o atraso de um periodo passa pro seguinte. */
export function nudgePoints(config) {
  const start = toMinutes(config.start);
  const end = toMinutes(config.end);
  const points = [];
  let from = start;
  let before = 0;
  for (const [period, cut] of PERIODS) {
    const until = Math.min(cut, end);
    if (until <= from) continue;
    const span = until - from;
    const target = until === end
      ? config.goalMl
      : Math.round((config.goalMl * (until - start)) / (end - start) / 50) * 50;
    const base = { period, until: toHHMM(until), targetMl: target };
    points.push({ ...base, kind: 'meio', at: from + Math.round(span / 2), needMl: (before + target) / 2 });
    points.push({ ...base, kind: 'fim', at: until - Math.min(FINAL_CALL_MIN, Math.floor(span / 4)), needMl: target });
    from = until;
    before = target;
  }
  return points;
}

/** Minutos (de hoje) em que o aviso adiado sai, ou null sem adiamento. */
function snoozeMinutes(state, today, tz) {
  if (!state.snoozedAt) return null;
  const events = [state.lastDrinkAt, state.lastSentAt].filter(Boolean).map((iso) => new Date(iso));
  if (!events.every((e) => e < new Date(state.snoozedAt))) return null;
  const snooze = localParts(new Date(state.snoozedAt), tz);
  return snooze.day === today.day ? snooze.minutes + SNOOZE_MIN : null;
}

/** O proximo aviso de hoje, com `at` em minutos desde a meia-noite, ja
 *  vencido (at <= agora) ou nao; null se hoje nao sai mais nenhum. */
function upcomingNudge(config, state, now) {
  const today = localParts(now, config.tz);
  const end = toMinutes(config.end);
  if (!config.days.includes(today.weekday) || today.minutes >= end) return null;
  const todayMl = state.day === today.day ? state.todayMl : 0;
  const points = nudgePoints(config);

  // O adiamento vale ate o proximo evento: o aviso adiado sair, ou um copo.
  // Sai mesmo fora dos momentos, porque adiar vem de quem ainda nao bebeu.
  const snooze = snoozeMinutes(state, today, config.tz);
  if (snooze !== null) {
    if (snooze >= end) return null;
    const period = points.find((p) => toMinutes(p.until) > snooze) ?? points.at(-1);
    return { ...period, kind: 'adiado', at: snooze };
  }

  const behind = (p) => todayMl < p.needMl;
  // So o momento mais recente conta: um aviso perdido e substituido pelo seguinte.
  const current = points.filter((p) => p.at <= today.minutes).at(-1);
  const sent = state.lastSentAt && localParts(new Date(state.lastSentAt), config.tz);
  const alreadySent = sent && sent.day === today.day && sent.minutes >= current?.at;
  if (current && !alreadySent && behind(current)) return current;
  return points.find((p) => p.at > today.minutes && behind(p)) ?? null;
}

/** O aviso vencido agora ({ kind: 'meio' | 'fim' | 'adiado', period, until,
 *  targetMl }), ou null. */
export function dueNudge(config, state, now) {
  const nudge = upcomingNudge(config, state, now);
  return nudge && nudge.at <= localParts(now, config.tz).minutes ? nudge : null;
}

export const isDue = (config, state, now) => dueNudge(config, state, now) !== null;

/** "HH:MM" do proximo aviso de hoje se nada for bebido, ou null. */
export function nextReminder(config, state, now) {
  const nudge = upcomingNudge(config, state, now);
  return nudge && toHHMM(Math.max(nudge.at, localParts(now, config.tz).minutes));
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const positiveInt = (n) => Number.isInteger(n) && n > 0;

function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string';
  } catch {
    return false;
  }
}

/** Mensagem do primeiro problema da config, ou null se ela e valida. Tambem
 *  e a defesa do Worker contra o que chega pela rede, entao nao pode lancar. */
export function configError(config) {
  if (!config || typeof config !== 'object') return 'Configuração ausente.';
  const dayStart = config.dayStart ?? '00:00';
  if (![config.start, config.end, dayStart].every((t) => HHMM.test(t))) return 'Horário inválido.';
  if (toMinutes(config.end) <= toMinutes(config.start)) {
    return 'O fim dos lembretes precisa ser depois do início.';
  }
  // Antes da virada, o lembrete olharia o total do dia anterior.
  if (toMinutes(config.start) < toMinutes(dayStart)) {
    return 'Os lembretes precisam começar depois da virada do dia.';
  }
  if (!Array.isArray(config.days) || config.days.length === 0) {
    return 'Escolha pelo menos um dia da semana.';
  }
  if (!config.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return 'Dia da semana inválido.';
  }
  if (!positiveInt(config.goalMl) || !positiveInt(config.glassMl)) return 'Quantidade inválida.';
  if (!validTimeZone(config.tz)) return 'Fuso horário inválido.';
  return null;
}
