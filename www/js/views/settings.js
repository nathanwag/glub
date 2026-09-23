/* Ajustes — "quanto e quando eu quero ser lembrado?" */

import * as db from '../db.js';
import * as push from '../push.js';
import { configError } from '../reminder.js';
import {
  html, raw, setTop, toast, isIOS, isStandalone, fmtMl, refresh, APP_NAME,
} from '../ui.js';

const GLASSES = [150, 200, 250, 300, 350, 500];
const INTERVALS = [30, 45, 60, 90, 120];
// Semana comecando na segunda; o valor e o de Date#getDay.
const DAYS = [[1, 'S'], [2, 'T'], [3, 'Q'], [4, 'Q'], [5, 'S'], [6, 'S'], [0, 'D']];
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const fmtInterval = (min) => (min < 60 ? `${min} min` : `${min / 60} h`.replace('.', ','));

function segmented(name, options, value, label) {
  return html`<div class="seg" role="radiogroup" data-seg="${name}">${raw(options.map((opt) => html`
    <button type="button" role="radio" class="seg__opt" data-value="${opt}"
      aria-checked="${opt === value}">${label(opt)}</button>`).join(''))}</div>`;
}

async function save(patch) {
  const next = { ...db.settings(), ...patch };
  const error = configError(next);
  if (error) { toast(error); return false; }
  await db.saveSettings(patch);
  try {
    await push.sync();
  } catch (err) {
    toast(err.message);
  }
  return true;
}

function notificationsBlock(settings, subscribed) {
  if (isIOS() && !isStandalone()) {
    return html`
      <p class="hint">No iPhone, lembretes só funcionam com o app instalado:
      no Safari, toque em <strong>Compartilhar</strong> › <strong>Adicionar à Tela de Início</strong>
      e abra o ${APP_NAME} pelo ícone.</p>`;
  }
  if (!push.pushSupported()) {
    return html`<p class="hint">Este navegador não recebe notificações push.</p>`;
  }
  return html`
    <label class="field">
      <span class="field__k">Token do servidor</span>
      <input class="input" type="password" name="token" autocomplete="off"
        value="${settings.token}" placeholder="o APP_TOKEN do deploy">
    </label>
    <p class="status">${subscribed ? 'Lembretes ativos neste aparelho.' : 'Lembretes desligados.'}</p>
    <div class="row">
      ${raw(subscribed
    ? html`<button class="btn grow" type="button" data-action="disable">Desligar</button>
             <button class="btn btn--primary grow" type="button" data-action="test">Testar</button>`
    : html`<button class="btn btn--primary btn--block" type="button" data-action="enable">Ativar lembretes</button>`)}
    </div>`;
}

export async function render(view) {
  setTop({ title: 'Ajustes', back: '#/' });

  const s = db.settings();
  const subscribed = Boolean(await push.currentSubscription().catch(() => null));

  view.innerHTML = html`
    <section class="sec">
      <h2 class="section-title">Meta</h2>
      <div class="card card__pad stack">
        <div class="set-row">
          <span>Meta diária</span>
          <div class="stepper">
            <button class="icon-btn" type="button" data-goal="-250" aria-label="Diminuir meta">−</button>
            <span class="data stepper__v">${fmtMl(s.goalMl)}</span>
            <button class="icon-btn" type="button" data-goal="250" aria-label="Aumentar meta">+</button>
          </div>
        </div>
        <div>
          <p class="field__k">Tamanho do copo</p>
          ${raw(segmented('glassMl', GLASSES, s.glassMl, (ml) => ml))}
        </div>
      </div>
    </section>

    <section class="sec">
      <h2 class="section-title">Lembretes</h2>
      <div class="card card__pad stack">
        <div class="row">
          <label class="field grow"><span class="field__k">De</span>
            <input class="input" type="time" name="start" value="${s.start}"></label>
          <label class="field grow"><span class="field__k">Até</span>
            <input class="input" type="time" name="end" value="${s.end}"></label>
        </div>
        <div>
          <p class="field__k">A cada</p>
          ${raw(segmented('intervalMin', INTERVALS, s.intervalMin, fmtInterval))}
        </div>
        <div>
          <p class="field__k">Dias</p>
          <div class="days">${raw(DAYS.map(([d, letter]) => html`
            <button type="button" class="day" data-day="${d}" aria-pressed="${s.days.includes(d)}"
              aria-label="${DAY_NAMES[d]}">${letter}</button>`).join(''))}</div>
        </div>
        <label class="set-row">
          <span>Parar quando bater a meta</span>
          <input class="switch" type="checkbox" name="stopAtGoal" ${s.stopAtGoal ? 'checked' : ''}>
        </label>
        <p class="hint">O intervalo conta a partir do último copo registrado: quem acabou de beber não é lembrado.</p>
      </div>
    </section>

    <section class="sec">
      <h2 class="section-title">Notificações</h2>
      <div class="card card__pad stack">
        ${raw(notificationsBlock(s, subscribed))}
      </div>
    </section>
  `;

  view.onclick = async (e) => {
    const goal = e.target.closest('[data-goal]');
    if (goal) {
      const goalMl = Math.max(250, db.settings().goalMl + Number(goal.dataset.goal));
      if (await save({ goalMl })) refresh();
      return;
    }
    const opt = e.target.closest('.seg__opt');
    if (opt) {
      const key = opt.closest('[data-seg]').dataset.seg;
      if (await save({ [key]: Number(opt.dataset.value) })) refresh();
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) {
      const d = Number(day.dataset.day);
      const current = db.settings().days;
      const days = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
      if (await save({ days })) refresh();
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) runAction(action, e.target.closest('button'));
  };

  view.onchange = async (e) => {
    const { name } = e.target;
    if (name === 'start' || name === 'end') {
      if (!(await save({ [name]: e.target.value }))) e.target.value = db.settings()[name];
    } else if (name === 'stopAtGoal') {
      await save({ stopAtGoal: e.target.checked });
    } else if (name === 'token') {
      await db.saveSettings({ token: e.target.value.trim() });
      toast('Token salvo');
    }
  };
}

async function runAction(action, button) {
  if (!db.settings().token) { toast('Cole o token do servidor primeiro.'); return; }
  button.disabled = true;
  try {
    if (action === 'enable') {
      // Sem await antes daqui: o iOS so mostra o pedido de permissao dentro
      // do mesmo toque.
      await push.enable();
      toast('Lembretes ativados');
    } else if (action === 'disable') {
      await push.disable();
      toast('Lembretes desligados');
    } else if (action === 'test') {
      await push.sendTest();
      toast('Enviado — deve chegar em segundos');
    }
    refresh();
  } catch (err) {
    toast(err.message, 4000);
  } finally {
    button.disabled = false;
  }
}
