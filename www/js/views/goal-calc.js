/* Calcular meta — "quanto eu deveria beber por dia?" */

import * as db from '../db.js';
import * as push from '../push.js';
import { estimateWater } from '../hydration.js';
import {
  html, raw, setTop, toast, fmtMl, $,
} from '../ui.js';

const PROFILE_KEYS = ['weightKg', 'heightCm', 'age', 'sex', 'exerciseMin', 'hotClimate', 'pregnancy'];

const profile = () => Object.fromEntries(PROFILE_KEYS.map((k) => [k, db.settings()[k]]));

// Vazio vira null; aceita a virgula decimal do teclado do iPhone.
const parseNum = (value) => {
  const n = Number(String(value).trim().replace(',', '.'));
  return value.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n;
};

const numField = (name, label, unit, value, { decimal = false } = {}) => html`
  <label class="field grow">
    <span class="field__k">${label}</span>
    <span class="input-unit">
      <input class="input" type="text" name="${name}" inputmode="${decimal ? 'decimal' : 'numeric'}"
        autocomplete="off" value="${value == null ? '' : String(value).replace('.', ',')}">
      <span class="input-unit__u">${unit}</span>
    </span>
  </label>`;

function segmented(name, options, value) {
  return html`<div class="seg" role="radiogroup" data-seg="${name}">${raw(options.map(([v, label]) => html`
    <button type="button" role="radio" class="seg__opt" data-value="${v}"
      aria-checked="${String(v === value)}">${label}</button>`).join(''))}</div>`;
}

function resultHtml(estimate) {
  if (!estimate) {
    return html`<p class="hint">Informe seu peso para ver a estimativa.</p>`;
  }
  const current = db.settings().goalMl;
  return html`
    <p class="field__k">Meta sugerida</p>
    <p class="data calc__total">${fmtMl(estimate.totalMl)}</p>
    <ul class="calc__steps">${raw(estimate.steps.map((s, i) => html`
      <li><span>${s.label}</span><span class="data">${i ? '+' : ''}${fmtMl(s.ml)}</span></li>`).join(''))}
    </ul>
    <button class="btn btn--primary btn--block" type="button" data-use
      ${estimate.totalMl === current ? 'disabled' : ''}>
      ${estimate.totalMl === current ? 'Já é a sua meta' : `Usar como meta (hoje: ${fmtMl(current)})`}
    </button>
    ${raw(estimate.compare.length ? html`
      <p class="field__k calc__cmp-title">Outros métodos, para comparar</p>
      <ul class="calc__steps">${raw(estimate.compare.map((c) => html`
        <li><span>${c.label}<small>${c.note}</small></span><span class="data">${fmtMl(c.ml)}</span></li>`).join(''))}
      </ul>` : '')}`;
}

function renderResult() {
  $('#calc-result').innerHTML = resultHtml(estimateWater(profile()));
}

export async function render(view) {
  setTop({ title: 'Calcular meta', back: '#/ajustes/meta' });
  const p = profile();

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">
        <div class="row">
          ${raw(numField('weightKg', 'Peso', 'kg', p.weightKg, { decimal: true }))}
          ${raw(numField('age', 'Idade', 'anos', p.age))}
        </div>
      </div>
    </section>

    <section class="sec">
      <h2 class="section-title">Opcional · refina a estimativa</h2>
      <div class="card card__pad stack">
        <div class="row">
          ${raw(numField('heightCm', 'Altura', 'cm', p.heightCm))}
          ${raw(numField('exerciseMin', 'Exercício por dia', 'min', p.exerciseMin))}
        </div>
        <div>
          <p class="field__k">Sexo</p>
          ${raw(segmented('sex', [['', 'Não informar'], ['f', 'Feminino'], ['m', 'Masculino']], p.sex))}
        </div>
        ${raw(p.sex === 'f' ? html`<div>
          <p class="field__k">Gestação</p>
          ${raw(segmented('pregnancy', [['', 'Não'], ['pregnant', 'Gestante'], ['lactating', 'Amamentando']], p.pregnancy))}
        </div>` : '')}
        <label class="set-row">
          <span>Clima quente ou muito suor</span>
          <input class="switch" type="checkbox" name="hotClimate" ${p.hotClimate ? 'checked' : ''}>
        </label>
      </div>
    </section>

    <section class="sec">
      <div class="card card__pad" id="calc-result"></div>
      <p class="hint calc__note">A conta principal usa ml por kg conforme a idade: 40 até 17 anos,
      35 até 55, 30 até 65 e 25 depois. Exercício soma 500 ml por hora, que é o mínimo de suor
      segundo o ACSM. É uma estimativa para pessoas saudáveis: com doença renal ou cardíaca, ou
      restrição de líquidos, siga a orientação médica.</p>
    </section>
  `;
  renderResult();

  view.oninput = async (e) => {
    const { name } = e.target;
    if (!PROFILE_KEYS.includes(name) || e.target.type === 'checkbox') return;
    await db.saveSettings({ [name]: parseNum(e.target.value) });
    renderResult();
  };

  view.onchange = async (e) => {
    if (e.target.name !== 'hotClimate') return;
    await db.saveSettings({ hotClimate: e.target.checked });
    renderResult();
  };

  view.onclick = async (e) => {
    const opt = e.target.closest('.seg__opt');
    if (opt) {
      const key = opt.closest('[data-seg]').dataset.seg;
      const patch = { [key]: opt.dataset.value };
      // Gestacao so vale com sexo feminino; trocar o sexo limpa a escolha.
      if (key === 'sex' && opt.dataset.value !== 'f') patch.pregnancy = '';
      await db.saveSettings(patch);
      if (key === 'sex') { render(view); return; }
      opt.closest('[data-seg]').querySelectorAll('.seg__opt')
        .forEach((b) => b.setAttribute('aria-checked', String(b === opt)));
      renderResult();
      return;
    }
    if (e.target.closest('[data-use]')) {
      const { totalMl } = estimateWater(profile());
      await db.saveSettings({ goalMl: totalMl });
      push.sync().catch(() => {});
      toast(`Meta diária: ${fmtMl(totalMl)}`);
      location.hash = '#/ajustes/meta';
    }
  };
}
