/* Hoje — "quanto eu ja bebi, e quando vem o proximo lembrete?" */

import * as db from '../db.js';
import * as push from '../push.js';
import {
  addDays, byPeriod, daySummary, history, parseMl,
} from '../intake.js';
import { SNOOZE_MIN, nextReminder } from '../reminder.js';
import * as puffer from '../puffer.js';
import {
  html, raw, setTop, toast, buzz, refresh, fmtMl, isIOS, isStandalone,
  openSheet, closeSheet, node, fmtTime, fmtDay, APP_NAME,
} from '../ui.js';

export const OTHER_AMOUNTS = [100, 150, 200, 300, 350, 400, 500, 750];


// Copo registrado pelo toque na notificacao. A faixa de desfazer/adiar fica
// enquanto ele for o ultimo copo e for recente.
let fromReminder = null;
const NOTICE_MS = 30 * 60 * 1000;

const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.7 7.7 0 0 0-2.6-1.5L14.2 2.6h-4l-.3 2.5a7.7 7.7 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.7 7.7 0 0 0 2.6 1.5l.3 2.5h4l.3-2.5a7.7 7.7 0 0 0 2.6-1.5l2.3 1 2-3.4z"/></svg>';

async function drink(ml) {
  buzz();
  await db.addIntake(ml);
  refresh();
  // Adia o proximo lembrete no Worker. Offline nao impede registrar.
  push.sync().catch(() => {});
}

async function undo(id) {
  await db.deleteIntake(id);
  refresh();
  push.sync().catch(() => {});
}

/** Rota #/bebi?lembrete=<id>, aberta pelo toque na notificacao: o iOS nao
 *  mostra botoes em web push, entao o toque ja e o "bebi". */
export async function drinkFromReminder(view, params) {
  const id = params.get('lembrete');
  // O mesmo link pode rodar de novo (hashchange e visibilitychange juntos,
  // recarregar). saveSettings atualiza o cache antes do primeiro await, entao
  // a segunda passada ja ve o id.
  if (id && db.settings().lastReminder !== id) {
    const saved = db.saveSettings({ lastReminder: id });
    buzz();
    fromReminder = await db.addIntake(db.settings().glassMl);
    await saved;
    push.sync().catch(() => {});
  }
  history.replaceState(null, '', '#/');
  await render(view);
}

async function snooze() {
  const { id } = fromReminder;
  fromReminder = null;
  await db.deleteIntake(id);
  await db.saveSettings({ snoozedAt: new Date().toISOString() });
  refresh();
  push.sync().then(
    () => toast(`Lembro de novo em ${SNOOZE_MIN} min`),
    () => toast('Sem conexão: não deu pra adiar.'),
  );
}

function reminderNotice(intakes) {
  const shown = fromReminder && intakes[0]?.id === fromReminder.id
    && Date.now() - new Date(fromReminder.at) < NOTICE_MS;
  if (!shown) return '';
  return html`
    <section class="notice card card__pad">
      <p><strong>${fmtMl(fromReminder.ml)}</strong> registrados pelo lembrete.</p>
      <div class="notice__actions">
        <button class="btn btn--primary" type="button" data-snooze>Não bebi · adiar ${SNOOZE_MIN} min</button>
        <button class="btn btn--ghost" type="button" data-undo="${fromReminder.id}">Desfazer</button>
      </div>
    </section>`;
}

function leftLine(leftMl, glassMl) {
  if (leftMl <= 0) return 'Baiacu cheio: meta de hoje batida';
  const cups = Math.ceil(leftMl / glassMl);
  return `Faltam ${fmtMl(leftMl)} · ${cups} ${cups === 1 ? 'copo' : 'copos'} pro baiacu encher`;
}

function reminderLine(settings, summary, subscribed) {
  if (isIOS() && !isStandalone()) {
    return html`<a class="status" href="#/ajustes">Para receber lembretes, adicione o ${APP_NAME} à Tela de Início.</a>`;
  }
  if (!subscribed) {
    return html`<a class="status" href="#/ajustes">Lembretes desligados · <strong>ativar</strong></a>`;
  }
  const next = nextReminder(settings, {
    lastDrinkAt: summary.lastDrinkAt, day: db.dayOf(), todayMl: summary.totalMl,
    snoozedAt: settings.snoozedAt,
  }, new Date());
  return next
    ? html`<p class="status">Próximo lembrete por volta das <strong>${next}</strong></p>`
    : html`<p class="status">Sem mais lembretes hoje.</p>`;
}

// Periodos que a pessoa abriu ou fechou, em relacao ao padrao (so o atual
// aberto). Sobrevive ao redesenho de cada copo e zera quando o dia vira.
let toggled = { day: null, ids: new Set() };

const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CHEVRON = '<svg class="period__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function periodList(intakes) {
  if (!intakes.length) return html`<p class="muted empty">Nenhum copo ainda hoje.</p>`;
  const day = db.dayOf();
  if (toggled.day !== day) toggled = { day, ids: new Set() };

  return html`<div class="card periods">${raw(byPeriod(intakes, db.settings().tz, new Date()).map((p) => {
    if (!p.intakes.length) {
      return html`
        <div class="period period--empty">
          <span class="period__name">${p.label}<small>${p.range}</small></span>
          <span>${p.when === 'past' ? 'nenhum copo' : 'ainda não'}</span>
        </div>`;
    }
    const open = toggled.ids.has(p.id) !== (p.when === 'now');
    const n = p.intakes.length;
    return html`
      <button class="period" type="button" data-period="${p.id}" aria-expanded="${String(open)}">
        <span class="period__name">${p.label}<small>${n} ${n === 1 ? 'copo' : 'copos'} · ${p.range}</small></span>
        <span class="data period__ml">${fmtMl(p.totalMl)}</span>
        ${raw(CHEVRON)}
      </button>
      <ul class="period__list" ${open ? '' : 'hidden'}>${raw(p.intakes.map((i) => html`
        <li class="list__row">
          <span class="data list__time">${fmtTime(i.at)}</span>
          <span class="grow">${fmtMl(i.ml)}</span>
          <button class="icon-btn" type="button" data-undo="${i.id}" aria-label="Apagar ${fmtMl(i.ml)} das ${fmtTime(i.at)}">${raw(X)}</button>
        </li>`).join(''))}
      </ul>`;
  }).join(''))}</div>`;
}

function togglePeriod(button) {
  const { period } = button.dataset;
  if (!toggled.ids.delete(period)) toggled.ids.add(period);
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(open));
  button.nextElementSibling.hidden = !open;
}

// A porta do Historico: sem icone no topo, e a semana que chama pra olhar.
async function weekCard(goalMl) {
  const today = db.dayOf();
  const { days, daysAtGoal } = history(await db.intakesBetween(addDays(today, -6), today), today, 7, goalMl);
  // Mesma escala do grafico do Historico.
  const top = Math.max(goalMl, ...days.map((d) => d.totalMl)) * 1.12;
  const pct = (ml) => `${(ml / top) * 100}%`;
  const state = (d) => (d.day === today ? ' is-today' : d.totalMl >= goalMl ? ' is-met' : '');

  return html`
    <a class="card week" href="#/historico" aria-label="Histórico: ${daysAtGoal} dos últimos 7 dias na meta">
      <span class="week__head">
        <span class="week__title">Últimos 7 dias</span>
        <span class="week__more">${daysAtGoal} na meta · histórico ›</span>
      </span>
      <span class="week__plot" aria-hidden="true">
        <span class="week__goal" style="bottom: ${pct(goalMl)}"></span>
        ${raw(days.map((d) => html`<span class="week__bar${state(d)}" style="height: ${pct(d.totalMl)}"></span>`).join(''))}
      </span>
      <span class="week__x" aria-hidden="true">${raw(days.map((d) => html`
        <span class="${d.day === today ? 'is-today' : ''}">${fmtDay(d.day, { weekday: 'narrow' })}</span>`).join(''))}
      </span>
    </a>`;
}

export async function render(view) {
  setTop({
    title: APP_NAME,
    actions: html`<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${raw(GEAR)}</a>`,
  });

  const settings = db.settings();
  const intakes = await db.intakesOfDay();
  const summary = daySummary(intakes, settings.goalMl);
  const subscribed = Boolean(await push.currentSubscription().catch(() => null));

  view.innerHTML = html`
    ${raw(reminderNotice(intakes))}
    <section class="hero">
      <div class="fish" data-fish role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(summary.progress * 100)}" aria-label="Meta de hoje"></div>
      <div class="hero__num">
        <span class="data hero__total">${new Intl.NumberFormat('pt-BR').format(summary.totalMl)}</span>
        <span class="hero__goal">/ ${fmtMl(settings.goalMl)}</span>
      </div>
      <p class="hero__left">${leftLine(summary.leftMl, settings.glassMl)}</p>
    </section>

    <button class="btn btn--primary btn--lg btn--block" type="button" data-drink="${settings.glassMl}">
      + ${fmtMl(settings.glassMl)}
    </button>
    <button class="btn btn--ghost btn--block" type="button" data-other>Outra quantidade</button>

    ${raw(reminderLine(settings, summary, subscribed))}

    ${raw(await weekCard(settings.goalMl))}

    <h2 class="section-title">Hoje</h2>
    ${raw(periodList(intakes))}
    <a class="btn btn--ghost btn--block" href="#/dia?d=${addDays(db.dayOf(), -1)}">Esqueceu um copo? Ver ontem</a>
  `;

  puffer.mount(view.querySelector('[data-fish]'), summary.progress);

  view.onclick = (e) => {
    const periodBtn = e.target.closest('[data-period]');
    if (periodBtn) { togglePeriod(periodBtn); return; }
    const drinkBtn = e.target.closest('[data-drink]');
    if (drinkBtn) { drink(Number(drinkBtn.dataset.drink)); return; }
    const undoBtn = e.target.closest('[data-undo]');
    if (undoBtn) { undo(Number(undoBtn.dataset.undo)); toast('Registro apagado'); return; }
    if (e.target.closest('[data-snooze]')) { snooze(); return; }
    if (e.target.closest('[data-other]')) pickOther();
  };
}

function pickOther() {
  const body = node(html`<div class="stack">
    <div class="amounts">${raw(OTHER_AMOUNTS.map((ml) => html`
      <button class="btn" type="button" data-ml="${ml}">${fmtMl(ml)}</button>`).join(''))}</div>
    <form>
      <label class="field__k" for="other-ml">Outro valor</label>
      <div class="row">
        <span class="input-unit grow">
          <input class="input" id="other-ml" name="ml" type="text" inputmode="numeric" autocomplete="off" placeholder="ex.: 1000">
          <span class="input-unit__u">ml</span>
        </span>
        <button class="btn btn--primary" type="submit">Adicionar</button>
      </div>
    </form>
  </div>`);
  body.onclick = (e) => {
    const btn = e.target.closest('[data-ml]');
    if (!btn) return;
    closeSheet();
    drink(Number(btn.dataset.ml));
  };
  // Form pra tecla "Ir" do teclado do iPhone tambem adicionar.
  body.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const ml = parseMl(e.target.elements.ml.value);
    if (!ml) { toast('Digite quantos ml você bebeu.'); return; }
    closeSheet();
    drink(ml);
  };
  openSheet('Quanto você bebeu?', body);
}
