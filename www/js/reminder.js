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
  intervalMin: 60,
  days: [0, 1, 2, 3, 4, 5, 6],
  stopAtGoal: true,
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

const pad = (n) => String(n).padStart(2, '0');
const toHHMM = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Minutos (de hoje) em que o proximo lembrete vence — possivelmente ja no
 *  passado — ou null se hoje nao ha mais lembrete. */
function nextMinutes(config, state, today) {
  if (!config.days.includes(today.weekday)) return null;
  const todayMl = state.day === today.day ? state.todayMl : 0;
  if (config.stopAtGoal && todayMl >= config.goalMl) return null;

  // Conta a partir do evento mais recente de hoje, seja copo ou lembrete:
  // quem acabou de beber nao precisa ser lembrado.
  let next = toMinutes(config.start);
  for (const iso of [state.lastDrinkAt, state.lastSentAt]) {
    if (!iso) continue;
    const event = localParts(new Date(iso), config.tz);
    if (event.day === today.day) next = Math.max(next, event.minutes + config.intervalMin);
  }
  // O adiamento vale ate o proximo evento: o lembrete adiado sair, ou um copo.
  // Pode antecipar o lembrete, porque adiar vem de quem ainda nao bebeu.
  const events = [state.lastDrinkAt, state.lastSentAt].filter(Boolean).map((iso) => new Date(iso));
  if (state.snoozedAt && events.every((e) => e < new Date(state.snoozedAt))) {
    const snooze = localParts(new Date(state.snoozedAt), config.tz);
    if (snooze.day === today.day) next = snooze.minutes + SNOOZE_MIN;
  }
  return next < toMinutes(config.end) ? next : null;
}

export function isDue(config, state, now) {
  const today = localParts(now, config.tz);
  const next = nextMinutes(config, state, today);
  return next !== null && today.minutes >= next && today.minutes < toMinutes(config.end);
}

/** "HH:MM" do proximo lembrete de hoje, ou null se nao ha mais nenhum. */
export function nextReminder(config, state, now) {
  const today = localParts(now, config.tz);
  const next = nextMinutes(config, state, today);
  if (next === null) return null;
  const when = Math.max(next, today.minutes);
  return when < toMinutes(config.end) ? toHHMM(when) : null;
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
  if (!HHMM.test(config.start) || !HHMM.test(config.end)) return 'Horário inválido.';
  if (toMinutes(config.end) <= toMinutes(config.start)) {
    return 'O fim dos lembretes precisa ser depois do início.';
  }
  if (!Array.isArray(config.days) || config.days.length === 0) {
    return 'Escolha pelo menos um dia da semana.';
  }
  if (!config.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return 'Dia da semana inválido.';
  }
  if (!positiveInt(config.intervalMin)) return 'Intervalo inválido.';
  if (!positiveInt(config.goalMl) || !positiveInt(config.glassMl)) return 'Quantidade inválida.';
  if (typeof config.stopAtGoal !== 'boolean') return 'Opção de meta inválida.';
  if (!validTimeZone(config.tz)) return 'Fuso horário inválido.';
  return null;
}
