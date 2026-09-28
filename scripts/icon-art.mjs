// Arte do icone do app: o baiacu feliz, um pouco de lado, soprando uma bolha.
// E um desenho proprio, mais simples que o baiacu animado de www/js/puffer.js,
// porque precisa ler bem com 29 px. So scripts/icons.mjs usa este arquivo.

const f = (n) => n.toFixed(1);
const NAVY = '#17324d';

// Quanto o peixe esta virado (0 = de frente). Os tracos do rosto andam pra
// direita e o olho do fundo encolhe na horizontal.
const YAW = 0.55;
const SQ = 1 - 0.38 * YAW;

function spikes() {
  let d = '';
  const n = 14, r = 38, len = 8, hw = 0.19;
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 16 + i * 2 * Math.PI / n;
    const deg = (a * 180 / Math.PI) % 360;
    // Sem espinho na boca nem atras, onde fica o rabo.
    if (deg < 26 || deg > 340 || (deg > 160 && deg < 200)) continue;
    const pt = (ang, rr) => `${f(rr * Math.cos(ang))} ${f(rr * Math.sin(ang))}`;
    d += `M${pt(a - hw, r - 3)} L${pt(a, r + len)} L${pt(a + hw, r - 3)}Z`;
  }
  return d;
}

// O peixe centrado em (0, 0), corpo de raio 38.
function fish() {
  const tail = `translate(${f((1 - YAW) * 12)} 0)`;
  const L = [-14 + 15 * YAW, 1], R = [14 + 12 * YAW, 1];
  const happyEye = ([x, y], k) => `<path d="M${f(x - 6 * k)} ${f(y + 2)} Q${f(x)} ${f(y - 7)} ${f(x + 6 * k)} ${f(y + 2)}" fill="none" stroke="${NAVY}" stroke-width="3.4" stroke-linecap="round"/>`;
  const mouth = [4 + 20 * YAW, 19];
  const fin = (x) => f(x + 10 * YAW);
  return `
    <defs><clipPath id="body"><circle r="38"/></clipPath></defs>
    <path transform="${tail}" d="M-32 2 C-40 -8 -47 -16 -56 -17 C-52 -6 -52 8 -56 19 C-47 18 -40 10 -32 2Z" fill="#ff8a3d"/>
    <path transform="${tail}" d="M-37 0 L-49 -7 M-37 3 L-50 4 M-37 6 L-48 13" stroke="#ffb27a" stroke-width="2" stroke-linecap="round"/>
    <path d="${spikes()}" fill="#f29b1d" stroke="#f29b1d" stroke-width="7" stroke-linejoin="round"/>
    <circle r="38" fill="#f5a524"/>
    <g clip-path="url(#body)">
      <circle cx="-6" cy="-8" r="38" fill="#ffcf4d"/>
      <ellipse cy="44" rx="40" ry="26" fill="#ffe08a" opacity=".55"/>
    </g>
    <ellipse cx="-18" cy="-24" rx="11" ry="6" fill="#fff4c4" transform="rotate(-32 -18 -24)"/>
    <path d="M${fin(-10)} 20 C${fin(-16)} 17 ${fin(-26)} 19 ${fin(-27)} 27 C${fin(-21)} 30 ${fin(-13)} 27 ${fin(-10)} 20Z" fill="#ff8a3d"/>
    ${happyEye(L, 1)}${happyEye(R, SQ)}
    <ellipse cx="${f(L[0] - 9)}" cy="${mouth[1] - 3}" rx="6.8" ry="4" fill="#ff7a8a" opacity=".6"/>
    <ellipse cx="${f(R[0] + 8 * SQ)}" cy="${mouth[1] - 3}" rx="${f(6.8 * SQ)}" ry="4" fill="#ff7a8a" opacity=".6"/>
    <ellipse cx="${f(mouth[0])}" cy="${mouth[1]}" rx="${f(4 * (1 - 0.2 * YAW))}" ry="4.4" fill="#ff8e9b"/>
    <ellipse cx="${f(mouth[0] + 0.6)}" cy="${f(mouth[1] + 0.3)}" rx="${f(1.9 * (1 - 0.2 * YAW))}" ry="2.4" fill="#7a2e45"/>`;
}

function bubble(x, y, r) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#fff" fill-opacity=".16" stroke="#fff" stroke-width="${f(Math.max(1.5, r * 0.18))}"/>
    <path d="M${f(x - r * 0.55)} ${f(y - r * 0.15)} a${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 ${f(r * 0.45)} ${f(-r * 0.45)}" fill="none" stroke="#fff" stroke-width="${f(Math.max(1.3, r * 0.16))}" stroke-linecap="round"/>
    ${r > 8 ? `<circle cx="${f(x + r * 0.42)}" cy="${f(y + r * 0.38)}" r="${f(r * 0.1)}" fill="#fff" opacity=".8"/>` : ''}`;
}

/** SVG do icone, quadrado cheio (o iOS arredonda os cantos). `maskable`
 *  encolhe o desenho pra zona segura do Android, um circulo de 80% do lado. */
export function icon({ maskable = false } = {}) {
  const x = 50, y = 78, s = 0.86, tilt = -6;
  const [bx, by, br] = [98, 36, 17];
  // O rastro de bolhinhas sai da borda do corpo e sobe ate a bolha grande.
  const len = Math.hypot(bx - x, by - y);
  const ux = (bx - x) / len, uy = (by - y) / len;
  const sx = x + ux * 47 * s, sy = y + uy * 47 * s;
  const ex = bx - ux * br, ey = by - uy * br;
  const trail = [[0.15, 2.4], [0.62, 3.6]]
    .map(([k, r]) => bubble(sx + (ex - sx) * k, sy + (ey - sy) * k, r)).join('');
  const art = `
    <circle cx="58" cy="72" r="52" fill="#fff" opacity=".08"/>
    <g transform="translate(${x} ${y}) rotate(${tilt}) scale(${s})">${fish()}</g>
    ${trail}${bubble(bx, by, br)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#29b2f5"/><stop offset="1" stop-color="#0a69bf"/></linearGradient></defs>
  <rect width="128" height="128" fill="url(#bg)"/>
  ${maskable ? `<g transform="translate(64 64) scale(.8) translate(-64 -64)">${art}</g>` : art}
</svg>`;
}
