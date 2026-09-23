import { buildPushPayload } from '@block65/webcrypto-web-push';
import { handleApi } from './api.js';
import { handleCron } from './cron.js';

function makeSend(env) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  return async (subscription, message) => {
    const payload = await buildPushPayload({
      data: message,
      // Lembrete de agua entregue horas depois so atrapalha; e o topic faz o
      // push service trocar um lembrete pendente pelo novo em vez de empilhar.
      options: { ttl: 30 * 60, urgency: 'high', topic: 'agua' },
    }, subscription, vapid);
    return fetch(subscription.endpoint, payload);
  };
}

const deps = (env) => ({
  kv: env.STATE,
  token: env.APP_TOKEN,
  vapidPublicKey: env.VAPID_PUBLIC_KEY,
  send: makeSend(env),
});

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, deps(env));
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron({ ...deps(env), now: new Date(event.scheduledTime) }));
  },
};
