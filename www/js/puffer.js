/* O baiacu: mascote e medidor da meta. Quanto mais cheio o dia, mais inflado
 * ele fica. Tudo aqui gera SVG como texto, sem tocar no DOM no topo do
 * modulo: scripts/icons.mjs importa este arquivo no node pra gerar os icones.
 *
 * Cores do SVG ficam fixas (o peixe e amarelo nos dois temas). A sombra e as
 * bolhas seguem o tema: a sombra le --fish-shadow e as bolhas usam
 * currentColor. */

const P = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
const f1 = (n) => n.toFixed(1);
const lerp2 = (u, v, k) => [u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k];

export const VIEWBOX = '-100 -92 200 184';

let uid = 0;
const nextId = () => `pf${++uid}`;

// Gradientes e filtros de um baiacu. Cada SVG precisa dos seus: ids repetidos
// entre SVGs da mesma pagina fazem um apontar pro do outro.
export function defs(id) {
  return `
  <radialGradient id="${id}b" cx="38%" cy="30%" r="75%">
    <stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#ffd24f"/><stop offset="1" stop-color="#f4a321"/>
  </radialGradient>
  <linearGradient id="${id}belly" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff6d8" stop-opacity="0"/><stop offset=".35" stop-color="#fff6d8" stop-opacity=".95"/><stop offset="1" stop-color="#ffe7a8"/>
  </linearGradient>
  <linearGradient id="${id}sp" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffd566"/><stop offset="1" stop-color="#ee9b1b"/>
  </linearGradient>
  <linearGradient id="${id}fin" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ff9a52"/><stop offset="1" stop-color="#ffc07a"/>
  </linearGradient>
  <radialGradient id="${id}eye" cx="40%" cy="35%" r="70%">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3edf5"/>
  </radialGradient>
  <radialGradient id="${id}iris" cx="40%" cy="35%" r="70%">
    <stop offset="0" stop-color="#34497a"/><stop offset="1" stop-color="#0d1730"/>
  </radialGradient>
  <filter id="${id}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="${id}soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>`;
}

function eye(id, x, y, e, blink, squeeze = 1) {
  if (blink < 0.25) {
    return `<path d="M${P(x - e * squeeze, y)} q${f1(e * squeeze)} ${f1(e * 0.55)} ${f1(2 * e * squeeze)} 0" fill="none" stroke="#17324d" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${squeeze} ${blink.toFixed(2)})">
    <ellipse rx="${f1(e)}" ry="${f1(e * 1.08)}" fill="url(#${id}eye)" stroke="#e2a12a" stroke-opacity=".5" stroke-width="1"/>
    <circle cx="${f1(e * 0.2)}" cy="${f1(e * 0.12)}" r="${f1(e * 0.7)}" fill="url(#${id}iris)"/>
    <circle cx="${f1(e * 0.38)}" cy="${f1(-e * 0.24)}" r="${f1(e * 0.3)}" fill="#fff"/>
    <circle cx="${f1(-e * 0.08)}" cy="${f1(e * 0.42)}" r="${f1(e * 0.13)}" fill="#fff" opacity=".9"/>
  </g>`;
}

/** O corpo inteiro, centrado em (0, 0). `p` e o quanto esta cheio (0 a 1,
 *  com folga pro balanco da mola); t, squash, blink e mouth animam. */
export function body(id, { p, t = 0.35, squash = 0, blink = 1, mouth = 0 }) {
  p = Math.max(-0.08, Math.min(1.1, p));
  const pc = Math.max(0, Math.min(1, p));
  const r = 30 + 24 * p;
  // Murcho ele e comprido; cheio, redondo.
  const rx = r * (1.16 - 0.16 * p) * (1 + squash * 0.1);
  const ry = r * (0.8 + 0.2 * p) * (1 - squash * 0.08);
  const len = 1.5 + 15 * pc;
  // Murcho, os espinhos deitam pra tras.
  const tilt = (1 - pc) * 0.95;
  const at = (a, k = 1) => [rx * k * Math.cos(a), ry * k * Math.sin(a)];

  let spikes = '';
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI + (i + 0.5) * (2 * Math.PI / N);
    const deg = Math.abs(a * 180 / Math.PI);
    if (deg < 44 || deg > 152) continue; // sem espinho na cara nem no rabo
    const b1 = at(a - 0.11, 0.95), b2 = at(a + 0.11, 0.95), m = at(a);
    const dir = a + Math.sign(Math.sin(a)) * tilt;
    const tip = [m[0] + Math.cos(dir) * len, m[1] + Math.sin(dir) * len];
    const t1 = lerp2(b1, tip, 0.78), t2 = lerp2(b2, tip, 0.78);
    spikes += `<path d="M${P(...b1)} L${P(...t1)} Q${P(...tip)} ${P(...t2)} L${P(...b2)}Z"/>`;
  }

  const e = 11.5 + 4 * p;
  const spot = (x, y, sx, sy) => `<ellipse cx="${f1(rx * x)}" cy="${f1(ry * y)}" rx="${f1(rx * sx)}" ry="${f1(ry * sy)}"/>`;
  return `
  <g transform="translate(0 ${f1(Math.sin(t * 1.6) * 4)}) rotate(${f1(Math.sin(t * 1.1) * 3)})">
    <g transform="translate(${f1(-rx + 7)} 0) rotate(${f1(Math.sin(t * 5.2) * 11)})">
      <path d="M0 -8 C-10 -11 -18 -25 -31 -25 C-27 -13 -25 -5 -28 0 C-25 5 -27 13 -31 25 C-18 25 -10 11 0 8Z" fill="url(#${id}fin)" stroke="#f08a3c" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M-5 -4 L-23 -17 M-5 0 L-24 0 M-5 4 L-23 17" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g fill="url(#${id}sp)" stroke="#e8951b" stroke-width="1" stroke-linejoin="round">${spikes}</g>
    <clipPath id="${id}c"><ellipse rx="${f1(rx)}" ry="${f1(ry)}"/></clipPath>
    <ellipse rx="${f1(rx)}" ry="${f1(ry)}" fill="url(#${id}b)"/>
    <g clip-path="url(#${id}c)">
      <ellipse cx="${f1(-rx * 0.04)}" cy="${f1(ry * 0.66)}" rx="${f1(rx * 1.02)}" ry="${f1(ry * 0.62)}" fill="url(#${id}belly)"/>
      <g fill="#ee9b1b" opacity=".38" filter="url(#${id}soft)">
        ${spot(-0.3, -0.58, 0.09, 0.07)}${spot(-0.6, -0.22, 0.08, 0.065)}${spot(-0.02, -0.8, 0.07, 0.055)}${spot(-0.55, -0.58, 0.05, 0.045)}
      </g>
      <ellipse cx="${f1(-rx * 0.08)}" cy="${f1(ry * 1.02)}" rx="${f1(rx * 0.9)}" ry="${f1(ry * 0.3)}" fill="#e89a2a" opacity=".22" filter="url(#${id}blur)"/>
      <ellipse cx="${f1(-rx * 0.22)}" cy="${f1(-ry * 0.56)}" rx="${f1(rx * 0.4)}" ry="${f1(ry * 0.17)}" fill="#fff" opacity=".55" transform="rotate(-18 ${f1(-rx * 0.22)} ${f1(-ry * 0.56)})" filter="url(#${id}soft)"/>
    </g>
    <ellipse rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="#e8951b" stroke-opacity=".7" stroke-width="1.4"/>
    ${eye(id, rx * 0.74, -ry * 0.24, e * 0.78, blink, 0.55)}
    <ellipse cx="${f1(rx * 0.36)}" cy="${f1(ry * 0.22)}" rx="9" ry="5" fill="#ff7e8a" opacity=".5" filter="url(#${id}soft)"/>
    <ellipse cx="${f1(rx * 0.8)}" cy="${f1(ry * 0.14)}" rx="5" ry="3.5" fill="#ff7e8a" opacity=".45" filter="url(#${id}soft)"/>
    ${eye(id, rx * 0.32, -ry * 0.16, e, blink)}
    <g transform="translate(${f1(rx * 0.95)} ${f1(ry * 0.2)})">
      <ellipse rx="${f1(4.6 + mouth * 1.5)}" ry="${f1(5 + mouth * 4)}" fill="#ff8e9b" stroke="#e5687a" stroke-width="1"/>
      <ellipse cx=".8" rx="${f1(1.8 + mouth)}" ry="${f1(2.2 + mouth * 3.2)}" fill="#7a2e45"/>
    </g>
    <g transform="translate(${f1(-rx * 0.02)} ${f1(ry * 0.3)}) rotate(${f1(Math.sin(t * 7.5) * 18 - 8)})">
      <path d="M0 0 C-6 -5 -19 -3 -22 6 C-15 11 -5 8 0 0Z" fill="url(#${id}fin)" opacity=".92" stroke="#f08a3c" stroke-width="1"/>
      <path d="M-3 1 L-16 1 M-3 2.5 L-13 6" stroke="#fff" stroke-opacity=".5" stroke-width="1.5" stroke-linecap="round"/>
    </g>
  </g>`;
}

const shadow = (p) => {
  const pc = Math.max(0, Math.min(1, p));
  return `<ellipse cy="${f1(44 + 30 * pc)}" rx="${f1(34 + 16 * pc)}" ry="5" style="fill:var(--fish-shadow)"/>`;
};

function bubbles(list) {
  return list.map((b) => `<g opacity="${Math.min(1, b.life * 2).toFixed(2)}">
    <circle cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r)}" style="fill:currentColor;fill-opacity:.12;stroke:currentColor" stroke-width="1.6"/>
    <path d="M${P(b.x - b.r * 0.5, b.y - b.r * 0.1)} a${f1(b.r * 0.55)} ${f1(b.r * 0.55)} 0 0 1 ${f1(b.r * 0.45)} ${f1(-b.r * 0.42)}" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
  </g>`).join('');
}

/** SVG parado, pra telas que so mostram o estado (dia passado). */
export function still(progress) {
  const id = nextId();
  return `<svg viewBox="${VIEWBOX}" aria-hidden="true"><defs>${defs(id)}</defs>${shadow(progress)}${body(id, { p: progress })}</svg>`;
}

/** Icone do app: quadrado cheio (o iOS arredonda). `maskable` encolhe o peixe
 *  pra zona segura do Android, um circulo de 80% do lado. */
export function icon({ maskable = false } = {}) {
  const id = nextId();
  const dots = [[18, 30, 5], [30, 106, 3.5], [106, 22, 4], [112, 100, 5], [14, 72, 3]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  const fish = maskable ? 'translate(62 66) scale(.56)' : 'translate(62 66) scale(.72)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>${defs(id)}
    <linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#57c9f6"/><stop offset="1" stop-color="#0f6db6"/></linearGradient>
    <radialGradient id="${id}glow" cx="50%" cy="45%" r="50%"><stop offset="0" stop-color="#bff0ff" stop-opacity=".55"/><stop offset="1" stop-color="#bff0ff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="128" height="128" fill="url(#${id}bg)"/>
  <circle cx="64" cy="62" r="56" fill="url(#${id}glow)"/>
  <g fill="#fff" fill-opacity=".25">${dots}</g>
  <g transform="${fish}">${body(id, { p: 1 })}</g>
  <g fill="#fff" fill-opacity=".18" stroke="#fff" stroke-width="2"><circle cx="${maskable ? 100 : 112}" cy="46" r="6"/><circle cx="${maskable ? 106 : 118}" cy="30" r="3.5"/></g>
</svg>`;
}

// Ultimo estado mostrado, entre renderizacoes da tela: refresh() recria o
// elemento, e o peixe novo continua de onde o antigo parou.
let shown = null;

/** Baiacu animado em `el`, inflado em `progress`. Se cresceu desde a ultima
 *  vez, ele engole (bolhas e balanco). Para sozinho quando `el` sai da tela. */
export function mount(el, progress) {
  const id = nextId();
  el.innerHTML = `<svg viewBox="${VIEWBOX}" aria-hidden="true"><defs>${defs(id)}</defs><g></g></svg>`;
  const g = el.querySelector('g:last-child');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const s = { p: shown ?? progress, v: 0, sq: 0, sqv: 0, mouth: 0, blinkT: -1, nextBlink: 1 + Math.random() * 3, nextIdle: 1.5 };
  let list = [];
  const spawn = (delay = 0) => {
    const rx = (30 + 24 * s.p) * 1.05;
    list.push({ x: rx + 8 + Math.random() * 6, y: 4 - delay * 30, r: 3 + Math.random() * 4.5, vx: 6 + Math.random() * 8, vy: -28 - Math.random() * 16, life: 1, delay });
  };
  if (shown !== null && progress > shown + 0.001) {
    s.sq = 1; s.mouth = 1;
    for (let k = 0; k < 4; k++) spawn(k * 0.12);
  }
  shown = progress;

  if (reduced) {
    g.innerHTML = shadow(progress) + body(id, { p: progress });
    return;
  }

  let last = performance.now();
  const frame = (now) => {
    if (!el.isConnected) return;
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    // Mola pra inflar com um pouco de exagero; outra pro balanco da engolida.
    s.v += ((progress - s.p) * 70 - s.v * 11) * dt;
    s.p += s.v * dt;
    s.sqv += (-s.sq * 320 - s.sqv * 13) * dt;
    s.sq += s.sqv * dt;
    s.mouth = Math.max(0, s.mouth - dt * 2.5);
    let blink = 1;
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blinkT = 0; s.nextBlink = 2.4 + Math.random() * 3; }
    if (s.blinkT >= 0) {
      s.blinkT += dt;
      blink = 1 - Math.sin(Math.min(1, s.blinkT / 0.18) * Math.PI);
      if (s.blinkT > 0.18) s.blinkT = -1;
    }
    s.nextIdle -= dt;
    if (s.nextIdle <= 0) { spawn(); s.nextIdle = 2 + Math.random() * 2.5; }
    for (const b of list) {
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.x += b.vx * dt + Math.sin(t * 4 + b.r) * 0.3;
      b.y += b.vy * dt;
      b.life -= dt * 0.55;
    }
    list = list.filter((b) => b.life > 0 && b.y > -95);
    g.innerHTML = shadow(s.p) + body(id, { p: s.p, t, squash: s.sq, blink, mouth: s.mouth })
      + bubbles(list.filter((b) => b.delay <= 0));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
