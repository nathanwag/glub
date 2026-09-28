/* Historico — "quanto eu venho bebendo?" Tocar num dia abre o dia pra editar. */

import * as db from '../db.js';
import { addDays, history } from '../intake.js';
import { html, raw, setTop, fmtMl, fmtDay } from '../ui.js';

const PERIODS = [7, 30];
// A sequencia olha pra tras alem da janela do grafico; um ano basta.
const STREAK_DAYS = 366;

const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n);
const dayHref = (day, today) => (day === today ? '#/' : `#/dia?d=${day}`);
const dayLabel = (day) => `${fmtDay(day, { weekday: 'short' }).replace('.', '')} ${fmtDay(day, { day: '2-digit', month: '2-digit' })}`;

function chart(days, goalMl, today) {
  const top = Math.max(goalMl, ...days.map((d) => d.totalMl)) * 1.12;
  const pct = (ml) => `${(ml / top) * 100}%`;
  const dense = days.length > 7;
  // Em 30 dias, rotula de 5 em 5 contando de hoje pra tras.
  const labelled = (i) => !dense || (days.length - 1 - i) % 5 === 0;
  const label = (day) => (dense ? fmtDay(day, { day: 'numeric' }) : fmtDay(day, { weekday: 'narrow' }));

  return html`
    <figure class="chart card card__pad${dense ? ' chart--dense' : ''}">
      <div class="chart__plot">
        <div class="chart__goal" style="bottom: ${pct(goalMl)}"><span>meta</span></div>
        ${raw(days.map((d) => html`
          <a class="chart__col${d.day === today ? ' is-today' : ''}" href="${dayHref(d.day, today)}"
             aria-label="${dayLabel(d.day)}: ${fmtMl(d.totalMl)}" title="${dayLabel(d.day)} · ${fmtMl(d.totalMl)}">
            <span class="chart__bar" style="height: ${pct(d.totalMl)}"></span>
          </a>`).join(''))}
      </div>
      <div class="chart__x" aria-hidden="true">
        ${raw(days.map((d, i) => html`<span class="${d.day === today ? 'is-today' : ''}">${labelled(i) ? label(d.day) : ''}</span>`).join(''))}
      </div>
    </figure>`;
}

function stat(value, label) {
  return html`<div class="stat card"><span class="data stat__v">${value}</span><span class="stat__k">${label}</span></div>`;
}

export async function render(view, params) {
  setTop({ title: 'Histórico', back: '#/' });

  const n = PERIODS.includes(Number(params.get('p'))) ? Number(params.get('p')) : PERIODS[0];
  const { goalMl } = db.settings();
  const today = db.dayOf();
  const intakes = await db.intakesBetween(addDays(today, -STREAK_DAYS), today);
  const h = history(intakes, today, n, goalMl);

  view.innerHTML = html`
    <div class="seg" role="radiogroup" aria-label="Período">${raw(PERIODS.map((p) => html`
      <button type="button" role="radio" class="seg__opt" data-period="${p}" aria-checked="${String(p === n)}">${p} dias</button>`).join(''))}
    </div>

    <div class="stats">
      ${raw(stat(fmtNum(h.avgMl), 'ml por dia, em média'))}
      ${raw(stat(`${h.daysAtGoal}/${n}`, 'dias na meta'))}
      ${raw(stat(h.streak, h.streak === 1 ? 'dia seguido na meta' : 'dias seguidos na meta'))}
    </div>

    ${raw(chart(h.days, goalMl, today))}
    <p class="hint">Meta de ${fmtMl(goalMl)}. Toque num dia pra ver ou adicionar copos.</p>

    <h2 class="section-title">Dias</h2>
    <ul class="list card">${raw([...h.days].reverse().map((d) => html`
      <li><a class="list__row list__row--link" href="${dayHref(d.day, today)}">
        <span class="daylist__name">${d.day === today ? 'Hoje' : dayLabel(d.day)}</span>
        <span class="grow meter meter--sm"><span class="meter__fill" style="width: ${Math.min(d.totalMl / goalMl, 1) * 100}%"></span></span>
        <span class="data daylist__ml${d.totalMl >= goalMl ? ' is-met' : ''}">${fmtNum(d.totalMl)}</span>
      </a></li>`).join(''))}
    </ul>
  `;

  view.onclick = (e) => {
    const opt = e.target.closest('[data-period]');
    // replace: trocar o periodo nao deve empilhar entradas no "voltar".
    if (opt) location.replace(`#/historico?p=${opt.dataset.period}`);
  };
}
