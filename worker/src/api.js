import { configError } from '../../www/js/reminder.js';
import { DEVICE_KEY, deliver, reminderMessage } from './cron.js';

const json = (data, status = 200) => Response.json(data, { status });
const empty = (status) => new Response(null, { status });

function authorized(request, token) {
  // Sem APP_TOKEN configurado a API fica fechada, nunca aberta.
  return Boolean(token) && request.headers.get('Authorization') === `Bearer ${token}`;
}

/** Rotas em /api/*. As dependencias vem de fora (index.js monta a partir do
 *  env) pra dar pra testar sem Cloudflare nem push service de verdade. */
export async function handleApi(request, { kv, token, send, vapidPublicKey }) {
  const { pathname } = new URL(request.url);

  if (pathname === '/api/vapid-public-key' && request.method === 'GET') {
    return json({ key: vapidPublicKey });
  }

  if (!authorized(request, token)) return json({ error: 'Token inválido.' }, 401);

  if (pathname === '/api/sync' && request.method === 'GET') {
    const device = await kv.get(DEVICE_KEY, 'json');
    return json({ subscribed: Boolean(device?.subscription) });
  }

  if (pathname === '/api/sync' && request.method === 'PUT') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Corpo inválido.' }, 400);
    }
    const error = configError(body?.config);
    if (error) return json({ error }, 400);

    // Mescla em vez de substituir: lastSentAt e do cron, e o app nao manda a
    // assinatura em toda sincronizacao. So os campos do app entram.
    const device = await kv.get(DEVICE_KEY, 'json') ?? {};
    const next = {
      ...device,
      config: body.config,
      lastDrinkAt: body.lastDrinkAt ?? null,
      snoozedAt: body.snoozedAt ?? null,
      todayMl: Number(body.todayMl) || 0,
      day: body.day ?? null,
      appUrl: `${new URL(request.url).origin}/`,
    };
    if ('subscription' in body) next.subscription = body.subscription;
    await kv.put(DEVICE_KEY, JSON.stringify(next));
    return empty(204);
  }

  if (pathname === '/api/test' && request.method === 'POST') {
    const device = await kv.get(DEVICE_KEY, 'json');
    if (!device?.subscription) return json({ error: 'Os lembretes não estão ativos.' }, 404);
    const status = await deliver({ kv, send }, device, reminderMessage(device, new Date()));
    if (status >= 200 && status < 300) return json({ ok: true });
    const gone = status === 404 || status === 410;
    return json(
      { error: gone ? 'A assinatura expirou. Ative os lembretes de novo.' : 'O serviço de push recusou o envio.' },
      gone ? 410 : 502,
    );
  }

  return json({ error: 'Rota desconhecida.' }, 404);
}
