/* Um dia passado — "o que eu bebi nesse dia?", pra completar o que faltou
 * registrar. Hoje continua sendo a tela inicial. */

import * as db from '../db.js';
import { addDays, atLocal, daySummary } from '../intake.js';
import { OTHER_AMOUNTS } from './today.js';
import * as puffer from '../puffer.js';
import {
  html, raw, setTop, toast, buzz, refresh, fmtMl, fmtDay, openSheet, closeSheet, node, intakeList,
} from '../ui.js';

const PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

const title = (day) => `${fmtDay(day, { weekday: 'short' }).replace('.', '')} ${fmtDay(day, { day: '2-digit', month: '2-digit' })}`;

function relative(day, today) {
  if (day === addDays(today, -1)) return 'Ontem';
  if (day === addDays(today, -2)) return 'Anteontem';
  return fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function render(view, params) {
  const today = db.dayOf();
  const day = params.get('d');
  // Hoje e o futuro nao tem tela aqui: hoje e a inicial.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || day >= today) {
    location.replace('#/');
    return;
  }

  setTop({ title: title(day), back: '#/historico' });

  const settings = db.settings();
  const intakes = await db.intakesOfDay(day);
  const summary = daySummary(intakes, settings.goalMl);
  const next = addDays(day, 1);

  view.innerHTML = html`
    <nav class="daynav" aria-label="Trocar de dia">
      <a class="icon-btn" href="#/dia?d=${addDays(day, -1)}" aria-label="Dia anterior">${raw(PREV)}</a>
      <span class="daynav__label">${relative(day, today)}</span>
      <a class="icon-btn" href="${next === today ? '#/' : `#/dia?d=${next}`}" aria-label="${next === today ? 'Hoje' : 'Dia seguinte'}">${raw(NEXT)}</a>
    </nav>

    <section class="hero">
      <div class="fish fish--sm" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(summary.progress * 100)}" aria-label="Meta do dia">${raw(puffer.still(summary.progress))}</div>
      <div class="hero__num">
        <span class="data hero__total">${new Intl.NumberFormat('pt-BR').format(summary.totalMl)}</span>
        <span class="hero__goal">/ ${fmtMl(settings.goalMl)}</span>
      </div>
      <p class="hero__left">${summary.leftMl > 0 ? `Ficaram faltando ${fmtMl(summary.leftMl)}` : 'Meta batida'}</p>
    </section>

    <button class="btn btn--primary btn--block" type="button" data-add>Adicionar copo</button>

    <h2 class="section-title">Copos</h2>
    ${raw(intakeList(intakes, 'Nenhum copo registrado nesse dia.'))}
  `;

  view.onclick = async (e) => {
    const undoBtn = e.target.closest('[data-undo]');
    if (undoBtn) {
      await db.deleteIntake(Number(undoBtn.dataset.undo));
      toast('Registro apagado');
      refresh();
      return;
    }
    if (e.target.closest('[data-add]')) pickAmount(day, settings);
  };
}

function pickAmount(day, settings) {
  const amounts = [settings.glassMl, ...OTHER_AMOUNTS.filter((ml) => ml !== settings.glassMl)];
  const body = node(html`<div class="stack">
    <label class="field">
      <span class="field__k">Horário</span>
      <input class="input" type="time" name="time" value="12:00" required>
    </label>
    <div class="amounts">${raw(amounts.map((ml) => html`
      <button class="btn" type="button" data-ml="${ml}">${fmtMl(ml)}</button>`).join(''))}</div>
  </div>`);
  body.onclick = async (e) => {
    const btn = e.target.closest('[data-ml]');
    if (!btn) return;
    const time = body.querySelector('[name=time]').value || '12:00';
    closeSheet();
    buzz();
    // Passado nao mexe no lembrete de hoje: nao precisa de push.sync().
    await db.addIntake(Number(btn.dataset.ml), new Date(atLocal(day, time, settings.tz, settings.dayStart)));
    refresh();
  };
  openSheet(`Adicionar em ${title(day)}`, body);
}
