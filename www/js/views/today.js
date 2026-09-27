/* Hoje — "quanto eu ja bebi, e quando vem o proximo lembrete?" */

import * as db from '../db.js';
import * as push from '../push.js';
import { addDays, daySummary } from '../intake.js';
import { SNOOZE_MIN, nextReminder } from '../reminder.js';
import {
  html, raw, setTop, toast, buzz, refresh, fmtMl, isIOS, isStandalone,
  openSheet, closeSheet, node, intakeList, APP_NAME,
} from '../ui.js';

export const OTHER_AMOUNTS = [100, 150, 200, 300, 350, 400, 500, 750];

const CHART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>';

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

export async function render(view) {
  setTop({
    title: APP_NAME,
    actions: html`<a class="icon-btn" href="#/historico" aria-label="Histórico">${raw(CHART)}</a>
      <a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${raw(GEAR)}</a>`,
  });

  const settings = db.settings();
  const intakes = await db.intakesOfDay();
  const summary = daySummary(intakes, settings.goalMl);
  const subscribed = Boolean(await push.currentSubscription().catch(() => null));

  view.innerHTML = html`
    ${raw(reminderNotice(intakes))}
    <section class="hero">
      <div class="hero__num">
        <span class="data hero__total">${new Intl.NumberFormat('pt-BR').format(summary.totalMl)}</span>
        <span class="hero__goal">/ ${fmtMl(settings.goalMl)}</span>
      </div>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(summary.progress * 100)}">
        <div class="meter__fill" style="width: ${summary.progress * 100}%"></div>
      </div>
      <p class="hero__left">${summary.leftMl > 0 ? `Faltam ${fmtMl(summary.leftMl)}` : 'Meta de hoje batida'}</p>
    </section>

    <button class="btn btn--primary btn--lg btn--block" type="button" data-drink="${settings.glassMl}">
      + ${fmtMl(settings.glassMl)}
    </button>
    <button class="btn btn--ghost btn--block" type="button" data-other>Outra quantidade</button>

    ${raw(reminderLine(settings, summary, subscribed))}

    <h2 class="section-title">Hoje</h2>
    ${raw(intakeList(intakes, 'Nenhum copo ainda hoje.'))}
    <a class="btn btn--ghost btn--block" href="#/dia?d=${addDays(db.dayOf(), -1)}">Esqueceu um copo? Ver ontem</a>
  `;

  view.onclick = (e) => {
    const drinkBtn = e.target.closest('[data-drink]');
    if (drinkBtn) { drink(Number(drinkBtn.dataset.drink)); return; }
    const undoBtn = e.target.closest('[data-undo]');
    if (undoBtn) { undo(Number(undoBtn.dataset.undo)); toast('Registro apagado'); return; }
    if (e.target.closest('[data-snooze]')) { snooze(); return; }
    if (e.target.closest('[data-other]')) pickOther();
  };
}

function pickOther() {
  const grid = node(html`<div class="amounts">${raw(OTHER_AMOUNTS.map((ml) => html`
    <button class="btn" type="button" data-ml="${ml}">${fmtMl(ml)}</button>`).join(''))}</div>`);
  grid.onclick = (e) => {
    const btn = e.target.closest('[data-ml]');
    if (!btn) return;
    closeSheet();
    drink(Number(btn.dataset.ml));
  };
  openSheet('Quanto você bebeu?', grid);
}
