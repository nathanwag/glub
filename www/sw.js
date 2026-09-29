/* Service worker do Glub: app offline + exibicao dos lembretes (push).
 *
 * Cache no mesmo esquema do gym_tracker: navegacao rede-primeiro, demais
 * arquivos cache-primeiro com revalidacao. Bumpar VERSION e como se deploya.
 */

const VERSION = 'glub-v16';

// Em localhost o cache atrapalha mais do que ajuda; o SW fica transparente
// (mas continua exibindo push, pra testar notificacao no desktop).
const DEV = self.location.hostname === 'localhost';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './fonts/figtree-variable.woff2',
  './fonts/bagel-fat-one.woff2',
  './js/app.js',
  './js/ui.js',
  './js/db.js',
  './js/push.js',
  './js/intake.js',
  './js/reminder.js',
  './js/hydration.js',
  './js/schedule.js',
  './js/puffer.js',
  './js/views/today.js',
  './js/views/settings.js',
  './js/views/goal-calc.js',
  './js/views/history.js',
  './js/views/day.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

// Cache e so aceleracao: se o CacheStorage falhar, segue sem ele.
const quiet = (promise) => promise.catch(() => null);

self.addEventListener('install', (event) => {
  if (DEV) { self.skipWaiting(); return; }
  event.waitUntil((async () => {
    // Falha de cache nao pode derrubar a instalacao: sem SW nao ha push, e
    // lembrete importa mais que abrir offline. Por isso o try, e o add um a
    // um (addAll aborta tudo se um item falhar).
    try {
      const cache = await caches.open(VERSION);
      await Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})));
    } catch (err) {
      console.error('precache falhou', err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = (await quiet(caches.keys())) || [];
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => quiet(caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (DEV) return;
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // A API e sempre ao vivo: estado de lembrete em cache mentiria.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        quiet(caches.open(VERSION).then((c) => c.put('./index.html', fresh.clone())));
        return fresh;
      } catch {
        return (await quiet(caches.match('./index.html'))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await quiet(caches.match(req));
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) quiet(caches.open(VERSION).then((c) => c.put(req, res.clone())));
        return res;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

/* ---------- Lembretes ----------
 * O Worker manda o payload no formato do Declarative Web Push
 * ({ web_push: 8030, notification: {...} }). No iOS 18.4+ o sistema ja sabe
 * exibi-lo sozinho; aqui e o caminho das versoes anteriores e dos outros
 * navegadores.
 *
 * Todo push TEM que mostrar uma notificacao: o iOS revoga a assinatura de
 * quem recebe push "silencioso". Por isso ha um texto padrao se o payload
 * vier estranho. */

self.addEventListener('push', (event) => {
  let n = {};
  try { n = event.data?.json()?.notification ?? {}; } catch { /* payload nao-JSON */ }
  event.waitUntil(self.registration.showNotification(n.title || 'Hora de um copo d’água', {
    body: n.body || '',
    tag: n.tag || 'agua',
    lang: 'pt-BR',
    icon: './icons/icon-192.png',
    data: { url: n.navigate || self.registration.scope },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => 'focus' in w);
    if (open) {
      // O link registra o copo (#/bebi?lembrete=...), entao a janela aberta
      // precisa ir ate ele, nao so ganhar foco.
      open.postMessage({ navigate: url });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
