/* Ajustes — um indice que resume cada grupo, e uma subtela por grupo. */

import * as db from '../db.js';
import * as push from '../push.js';
import { daySummary, parseMl } from '../intake.js';
import { configError, nextReminder } from '../reminder.js';
import {
  dayTimeline, intervalLabel, remindersSummary,
} from '../schedule.js';
import {
  html, raw, setTop, toast, isIOS, isStandalone, fmtMl, refresh, APP_NAME,
} from '../ui.js';

const INTERVALS = [30, 45, 60, 90, 120];
// Semana comecando na segunda; o valor e o de Date#getDay.
const DAYS = [[1, 'S'], [2, 'T'], [3, 'Q'], [4, 'Q'], [5, 'S'], [6, 'S'], [0, 'D']];
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const ICON = {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  drop: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.3 0z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  link: '<path d="M15 7h3a5 5 0 0 1 0 10h-3"/><path d="M9 17H6A5 5 0 0 1 6 7h3"/><path d="M8 12h8"/>',
};
const icon = (name) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`);
const CHEVRON = raw('<svg class="set-item__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>');

function segmented(name, options, value, label) {
  return html`<div class="seg" role="radiogroup" data-seg="${name}">${raw(options.map((opt) => html`
    <button type="button" role="radio" class="seg__opt" data-value="${opt}"
      aria-checked="${String(opt === value)}">${label(opt)}</button>`).join(''))}</div>`;
}

function item({ href, ico, title, sub }) {
  return html`
    <a class="set-item" href="${href}">
      <span class="set-item__ico">${icon(ico)}</span>
      <span class="set-item__text"><span class="set-item__title">${title}</span>
        ${raw(sub ? html`<span class="set-item__sub">${sub}</span>` : '')}</span>
      ${CHEVRON}
    </a>`;
}

async function save(patch, afterSave) {
  const next = { ...db.settings(), ...patch };
  const error = configError(next);
  if (error) { toast(error); return false; }
  await db.saveSettings(patch);
  await afterSave?.();
  try {
    await push.sync();
  } catch (err) {
    toast(err.message);
  }
  return true;
}

/* ---------- Indice ---------- */

async function reminderStatus(s) {
  const summary = daySummary(await db.intakesOfDay(), s.goalMl);
  const next = nextReminder(s, {
    lastDrinkAt: summary.lastDrinkAt, day: db.dayOf(), todayMl: summary.totalMl, snoozedAt: s.snoozedAt,
  }, new Date());
  return next ? `Ligados · próximo às ${next}` : 'Ligados · sem mais lembretes hoje';
}

async function masterCard(s, subscribed) {
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
    <label class="set-master">
      <span class="set-item__ico set-item__ico--yellow">${icon('bell')}</span>
      <span class="set-item__text">
        <span class="set-master__title">Lembretes</span>
        <span class="set-item__sub">${subscribed ? await reminderStatus(s) : 'Desligados neste aparelho'}</span>
      </span>
      <input class="switch" type="checkbox" name="reminders" aria-label="Lembretes neste aparelho"
        ${subscribed ? 'checked' : ''}>
    </label>`;
}

export async function render(view) {
  setTop({ title: 'Ajustes', back: '#/' });

  const s = db.settings();
  const subscribed = Boolean(await push.currentSubscription().catch(() => null));

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad">${raw(await masterCard(s, subscribed))}</div>
    </section>

    <section class="sec">
      <h2 class="section-title">Seu dia</h2>
      <nav class="card">
        ${raw(item({ href: '#/ajustes/meta', ico: 'drop', title: 'Meta', sub: `${fmtMl(s.goalMl)} por dia · ${fmtMl(s.glassMl)} por toque` }))}
        ${raw(item({ href: '#/ajustes/lembretes', ico: 'clock', title: 'Quando lembrar', sub: remindersSummary(s) }))}
        ${raw(item({ href: '#/ajustes/virada', ico: 'moon', title: 'Virada do dia', sub: s.dayStart === '00:00' ? 'À meia-noite' : `${s.dayStart} · a madrugada conta no dia anterior` }))}
      </nav>
    </section>

    <section class="sec">
      <h2 class="section-title">Este aparelho</h2>
      <div class="card">
        ${raw(subscribed ? html`
          <button class="set-item" type="button" data-action="test">
            <span class="set-item__ico">${icon('send')}</span>
            <span class="set-item__text"><span class="set-item__title set-item__title--accent">Mandar notificação de teste</span></span>
          </button>` : '')}
        ${raw(item({ href: '#/ajustes/servidor', ico: 'link', title: 'Servidor', sub: s.token ? 'Token salvo' : 'Falta colar o token' }))}
      </div>
    </section>
  `;

  view.onclick = (e) => {
    if (e.target.name === 'reminders') {
      runAction(e.target.checked ? 'enable' : 'disable', e.target);
      return;
    }
    const action = e.target.closest('[data-action]');
    if (action) runAction(action.dataset.action, action);
  };
}

async function runAction(action, control) {
  if (!db.settings().token) {
    toast('Cole o token do servidor primeiro.');
    location.hash = '#/ajustes/servidor';
    return;
  }
  control.disabled = true;
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
  } catch (err) {
    toast(err.message, 4000);
  } finally {
    // Redesenha mesmo na falha: o switch tem que voltar ao estado real.
    refresh();
  }
}

/* ---------- Subtelas ---------- */

// Cliques comuns das subtelas: segmentos, dias e stepper da meta.
async function onSettingClick(e) {
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
  }
}

export async function renderGoal(view) {
  setTop({ title: 'Meta', back: '#/ajustes' });
  const s = db.settings();

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">
        <div class="set-row">
          <span>Meta diária</span>
          <div class="stepper">
            <button class="icon-btn" type="button" data-goal="-250" aria-label="Diminuir meta">−</button>
            <span class="data stepper__v">${fmtMl(s.goalMl)}</span>
            <button class="icon-btn" type="button" data-goal="250" aria-label="Aumentar meta">+</button>
          </div>
        </div>
        <a class="set-row set-row--link" href="#/meta">
          <span>Calcular minha meta</span>
          <span class="muted">peso, idade… ›</span>
        </a>
        <label class="set-row">
          <span>Copo ou garrafa</span>
          <span class="input-unit input-unit--short">
            <input class="input" type="text" name="glassMl" inputmode="numeric" autocomplete="off" value="${s.glassMl}">
            <span class="input-unit__u">ml</span>
          </span>
        </label>
        <p class="hint">É o que o botão amarelo da tela Hoje soma a cada toque. Bebe numa garrafa? Ponha o tamanho dela.</p>
      </div>
    </section>
  `;
  view.onclick = onSettingClick;
  view.onchange = async (e) => {
    if (e.target.name !== 'glassMl') return;
    // Vazio vira null, e o configError recusa.
    const glassMl = parseMl(e.target.value);
    if (await save({ glassMl })) toast(`Cada toque soma ${fmtMl(glassMl)}`);
    e.target.value = db.settings().glassMl;
  };
}

// Rotulos de hora sobre a barra; os da virada somem quando encostam na janela.
function timelineLabels(s, t) {
  const labels = [];
  if (t.from >= 0.15) labels.push([0, s.dayStart, 'start']);
  labels.push([t.from, s.start]);
  if (t.to - t.from >= 0.15) labels.push([t.to, s.end]);
  if (t.to <= 0.85) labels.push([1, s.dayStart, 'end']);
  return labels.map(([at, text, edge]) => html`
    <span class="tl__label${edge ? ` tl__label--${edge}` : ''}" style="left: ${at * 100}%">${text}</span>`).join('');
}

function timeline(s) {
  const t = dayTimeline(s);
  const n = t.reminders.length;
  return html`
    <div class="set-row set-row--tight">
      <span class="set-master__title">Seu dia</span>
      <a class="muted" href="#/ajustes/virada">vira às <strong>${s.dayStart}</strong></a>
    </div>
    <div class="tl" aria-hidden="true">
      <div class="tl__bar">
        <span class="tl__win" style="left: ${t.from * 100}%; width: ${(t.to - t.from) * 100}%"></span>
        ${raw(t.reminders.map((at) => html`<span class="tl__tick" style="left: ${at * 100}%"></span>`).join(''))}
      </div>
      <div class="tl__labels">${raw(timelineLabels(s, t))}</div>
    </div>
    <p class="hint">Até ${n} ${n === 1 ? 'lembrete' : 'lembretes'} por dia. Cada um espera
    ${intervalLabel(s.intervalMin)} desde o último copo: quem acabou de beber não é lembrado.</p>`;
}

export async function renderReminders(view) {
  setTop({ title: 'Lembretes', back: '#/ajustes' });
  const s = db.settings();

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">${raw(timeline(s))}</div>
    </section>

    <section class="sec">
      <h2 class="section-title">Janela</h2>
      <div class="card card__pad stack">
        <div class="row">
          <label class="field grow"><span class="field__k">De</span>
            <input class="input" type="time" name="start" value="${s.start}"></label>
          <label class="field grow"><span class="field__k">Até</span>
            <input class="input" type="time" name="end" value="${s.end}"></label>
        </div>
        <div>
          <p class="field__k">Dias</p>
          <div class="days">${raw(DAYS.map(([d, letter]) => html`
            <button type="button" class="day" data-day="${d}" aria-pressed="${String(s.days.includes(d))}"
              aria-label="${DAY_NAMES[d]}">${letter}</button>`).join(''))}</div>
        </div>
      </div>
    </section>

    <section class="sec">
      <h2 class="section-title">Frequência</h2>
      <div class="card card__pad stack">
        <div>
          <p class="field__k">A cada</p>
          ${raw(segmented('intervalMin', INTERVALS, s.intervalMin, intervalLabel))}
        </div>
        <label class="set-row">
          <span>Parar quando bater a meta</span>
          <input class="switch" type="checkbox" name="stopAtGoal" ${s.stopAtGoal ? 'checked' : ''}>
        </label>
      </div>
    </section>
  `;

  view.onclick = onSettingClick;
  view.onchange = async (e) => {
    const { name } = e.target;
    if (name === 'start' || name === 'end') {
      // Redesenha pra linha do dia acompanhar; na recusa, volta o valor salvo.
      if (await save({ [name]: e.target.value })) refresh();
      else e.target.value = db.settings()[name];
    } else if (name === 'stopAtGoal') {
      await save({ stopAtGoal: e.target.checked });
    }
  };
}

export async function renderDayStart(view) {
  setTop({ title: 'Virada do dia', back: '#/ajustes' });
  const s = db.settings();

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">
        <label class="set-row">
          <span>O dia vira às</span>
          <input class="input input--time" type="time" name="dayStart" value="${s.dayStart}">
        </label>
        <p class="hint">Copos antes desse horário contam no dia anterior. Quem dorme depois da meia-noite pode pôr a virada de madrugada, tipo 05:00.</p>
      </div>
    </section>
  `;

  view.onchange = async (e) => {
    if (e.target.name !== 'dayStart') return;
    if (!(await save({ dayStart: e.target.value }, db.rekeyIntakes))) e.target.value = db.settings().dayStart;
  };
}

export async function renderServer(view) {
  setTop({ title: 'Servidor', back: '#/ajustes' });
  const s = db.settings();

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">
        <label class="field">
          <span class="field__k">Token do servidor</span>
          <input class="input" type="password" name="token" autocomplete="off"
            value="${s.token}" placeholder="o APP_TOKEN do deploy">
        </label>
        <p class="hint">É o segredo que o Worker exige pra aceitar os lembretes deste aparelho. Fica salvo só aqui.</p>
      </div>
    </section>
  `;

  view.onchange = async (e) => {
    if (e.target.name !== 'token') return;
    await db.saveSettings({ token: e.target.value.trim() });
    toast('Token salvo');
  };
}
