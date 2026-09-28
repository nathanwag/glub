# Glub

Lembrete de beber água no iPhone, com um baiacu que vai inflando a cada copo. É um app web instalado na Tela de Início,
que recebe notificações push ao longo do dia. Você registra cada copo, e os
horários são configurados no próprio app.

- **Lembrete inteligente.** O intervalo conta a partir do último copo
  registrado, então quem acabou de beber não é lembrado.
- **Configurável:** meta diária, tamanho do copo, janela de horário (ex.:
  08:00–22:00), intervalo (30 min a 2 h), dias da semana e a opção de parar
  quando bater a meta.
- **Calcular minha meta** (em Ajustes): estima quanto beber por dia a partir
  do peso e da idade. É a regra de ml por kg das calculadoras brasileiras (40,
  35, 30 ou 25 ml conforme a faixa). Exercício, calor, gestação ou
  amamentação, altura e sexo são opcionais. Os dois últimos habilitam a
  comparação com a superfície corporal e com a referência da EFSA. Os dados
  ficam só no aparelho.
- **Custo zero:** um Cloudflare Worker no plano grátis. O repositório pode ser
  privado.

## Como funciona

```
iPhone (app instalado)              Cloudflare Worker
  registra copos (IndexedDB) ──PUT /api/sync──▶ KV: assinatura, ajustes, último copo
  sw.js exibe a notificação         cron a cada 5 min: venceu? → Web Push (VAPID)
        ▲                                     │
        └────────── push da Apple ◀───────────┘
```

O iOS não deixa um app web agendar notificações sozinho. Quem decide a hora é o
Worker, e a regra fica em `www/js/reminder.js`. O app importa esse arquivo pra
mostrar o "próximo lembrete", e o Worker importa o mesmo arquivo pra decidir o
envio.

## Setup (uma vez)

1. **Cloudflare.** Crie uma conta grátis em [dash.cloudflare.com](https://dash.cloudflare.com).
   - Em *My Profile › API Tokens*, crie um token com o template
     **Edit Cloudflare Workers**.
   - Anote também o **Account ID**, que aparece na barra lateral de
     *Workers & Pages*.
2. **Chaves de push (VAPID).** Rode `npx web-push generate-vapid-keys`.
3. **Secrets do GitHub.** Em *Settings › Secrets and variables › Actions*,
   cadastre:

   | Secret | Valor |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | o token do passo 1 |
   | `CLOUDFLARE_ACCOUNT_ID` | o Account ID |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | as chaves do passo 2 |
   | `VAPID_SUBJECT` | `mailto:seu-email@exemplo.com` |
   | `APP_TOKEN` | uma senha qualquer, que o app vai pedir |

4. **Deploy.** Faça um push na `main` ou rode o workflow **Deploy** na aba
   Actions. No fim do log aparece a URL:
   `https://water-alert.<seu-subdominio>.workers.dev`. O KV `STATE` é criado
   automaticamente no primeiro deploy.
5. **iPhone:**
   1. Abra a URL no **Safari** e toque em **Compartilhar › Adicionar à Tela de
      Início**.
   2. Abra o Glub **pelo ícone**. Push só funciona no app instalado.
   3. Vá em **Ajustes**, cole o `APP_TOKEN` e toque em **Ativar lembretes**.
      Aceite a permissão de notificação.
   4. Toque em **Testar**. A notificação deve chegar em segundos.

Tocar na notificação já registra um copo: o iOS não mostra botões em web push.
O app abre com a opção **Não bebi · adiar 10 min** (apaga o copo e lembra de
novo em 10 a 15 min) e **Desfazer**. Isso vale também pro **Testar**.

Requer iOS 16.4 ou mais novo.

## Desenvolvimento

```bash
npm test             # testes (node --test): regra dos lembretes, cron, API
npm run dev          # só a interface, com live reload (/phone = moldura de celular)
npm run dev:worker   # app + API + cron em http://localhost:8787 (wrangler dev)
```

O `dev:worker` precisa de um `worker/.dev.vars` (fica fora do git) com
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `APP_TOKEN`. Para
disparar o cron na mão:
`curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`.

No Chrome do desktop, o push funciona em `localhost`, então dá pra testar o
fluxo inteiro sem o iPhone. Os logs de produção aparecem em
`npx wrangler tail` (rode dentro de `worker/`).
