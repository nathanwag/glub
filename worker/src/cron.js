import { isDue, localParts } from '../../www/js/reminder.js';

export const DEVICE_KEY = 'device';

/** Payload no formato do Declarative Web Push (web_push: 8030, Safari 18.4+):
 *  o iOS mostra a notificacao sozinho mesmo se o service worker falhar, e o
 *  sw.js le o mesmo formato nas versoes anteriores.
 *
 *  O iOS nao mostra botoes em notificacao de web push, entao tocar nela ja e
 *  a resposta "bebi": o link abre a rota que registra o copo. O id (o instante
 *  do envio) impede que o mesmo toque registre duas vezes. */
export function reminderMessage(device, now) {
  const { config } = device;
  const today = localParts(now, config.tz).day;
  const drank = device.day === today ? device.todayMl : 0;
  const left = config.goalMl - drank;
  return {
    web_push: 8030,
    notification: {
      title: 'Hora de um copo d’água',
      body: left > 0
        ? `Faltam ${left} ml pra meta de hoje.`
        : 'Meta batida, mas um gole a mais não faz mal.',
      navigate: `${device.appUrl}#/bebi?lembrete=${encodeURIComponent(now.toISOString())}`,
      tag: 'agua',
      lang: 'pt-BR',
    },
  };
}

/** Envia `message` ao aparelho. Devolve o status HTTP do push service (0 se
 *  nem chegou nele) e o motivo que ele deu na recusa. 404/410 significam que o
 *  aparelho desinstalou o app ou revogou a permissao: a assinatura e
 *  esquecida, e o app manda uma nova na proxima vez que for aberto. */
export async function deliver({ kv, send }, device, message) {
  let res;
  try {
    res = await send(device.subscription, message);
  } catch (err) {
    console.error('push falhou', err);
    return { status: 0, reason: String(err?.message ?? err) };
  }
  const { status } = res;
  if (status >= 200 && status < 300) return { status };
  if (status === 404 || status === 410) {
    await kv.put(DEVICE_KEY, JSON.stringify({ ...device, subscription: null }));
  }
  const reason = await rejectionReason(res);
  console.error('push recusado', status, reason);
  return { status, reason };
}

// A Apple responde {"reason":"BadJwtToken"}; o FCM responde texto.
async function rejectionReason(res) {
  const text = (await res.text?.().catch(() => '')) ?? '';
  try {
    return JSON.parse(text).reason ?? text;
  } catch {
    return text.trim().slice(0, 200);
  }
}

const ok = (status) => status >= 200 && status < 300;

/** Uma rodada do cron: se o lembrete venceu, envia e grava quando enviou.
 *  `send(subscription, message)` e injetado — em producao e o Web Push. */
export async function handleCron({ kv, send, now }) {
  const device = await kv.get(DEVICE_KEY, 'json');
  if (!device?.subscription || !isDue(device.config, device, now)) return;

  const { status } = await deliver({ kv, send }, device, reminderMessage(device, now));
  // Falha nao grava lastSentAt: a proxima rodada tenta de novo.
  if (ok(status)) {
    console.log('lembrete enviado', status);
    await kv.put(DEVICE_KEY, JSON.stringify({ ...device, lastSentAt: now.toISOString() }));
  }
}
