# CLAUDE.md

## O que é

**Glub**: lembrete de beber água no iPhone (o app se chamava Gole, e o nome
ainda aparece no banco e no repo). Tem duas metades num repo só.

- **`www/`** é uma PWA em JavaScript puro, sem build, no padrão do
  `../gym_tracker` (Anilha). Usa hash routing, IndexedDB isolado em `db.js`,
  `ui.js` com o tagged template `html` e um service worker de cache versionado.
- **`worker/`** é um Cloudflare Worker que serve `www/` como static assets,
  expõe a API em `/api/*` e roda um cron a cada 5 min que decide e envia os
  lembretes por Web Push (VAPID). O estado vive no KV `STATE`, numa chave só
  (`device`, usuário único).

Tudo sai num único deploy (`.github/workflows/deploy.yml`, push na `main`).
Não há GitHub Pages: o repo é privado.

## Comandos

```bash
npm test                         # node --test: www/js/*.test.js e worker/src/*.test.js
node --test worker/src/cron.test.js
npm run dev                      # UI com live reload (browser-sync, sem API)
npm run dev:worker               # wrangler dev: app + API + cron (precisa de worker/.dev.vars)
```

## Regras que quebram em silêncio

- **`www/js/reminder.js` é compartilhado.** O Worker o importa por caminho
  relativo (`../../www/js/reminder.js`) e o wrangler embute no bundle. Ele
  precisa continuar **puro e sem imports**, e nunca usar getters locais de
  `Date`, porque o Worker roda em UTC. Tudo passa por `localParts(date, tz)`.
- **Toda alteração em `www/` exige bumpar `VERSION` em `www/sw.js`**
  (`glub-vN`). O cache é cache-first. Sem o bump, o app instalado continua
  servindo os arquivos antigos.
- **Todo push precisa mostrar uma notificação.** O iOS revoga a assinatura de
  quem recebe push silencioso. O payload usa o formato do Declarative Web
  Push (`web_push: 8030`), que o iOS 18.4+ exibe sozinho, e o `sw.js` exibe o
  mesmo formato nas versões anteriores.
- **Falha de cache não pode impedir o SW de instalar.** Sem SW não há push.
  Por isso o precache fica em try/catch e todo acesso a `caches` passa por
  `quiet()`. Pelo mesmo motivo, `push.currentSubscription()` usa
  `getRegistration()`: `serviceWorker.ready` nunca resolve sem SW, e a tela
  ficaria em branco.
- **`Notification.requestPermission()` tem que ser o primeiro `await`** de
  `push.enable()`. O iOS só mostra o pedido dentro do mesmo toque do usuário.
- **`PUT /api/sync` mescla, não substitui.** `lastSentAt` pertence ao cron, e
  `subscription` só muda quando vem no corpo: objeto liga, `null` desliga,
  ausente mantém.
- **Tocar na notificação registra um copo.** O `navigate` é
  `#/bebi?lembrete=<envio ISO>`, e o id guardado em `lastReminder` impede o
  mesmo toque de contar duas vezes. Com o app já aberto, o `sw.js` manda o
  link por `postMessage`. `snoozedAt` (adiar) vale até o próximo copo ou
  lembrete, e o `sync` sempre o envia.
- **O perfil da calculadora de meta fica só no aparelho** (peso, altura,
  idade, sexo, exercício, calor e gestação, guardados em `settings`).
  `push.serverConfig()` só envia as chaves de `DEFAULT_CONFIG`. Não mande
  dado de saúde pro Worker.
- **O dia vira em `dayStart`, não à meia-noite.** Copo antes dessa hora conta
  no dia anterior. Todo "que dia é" passa por `dayOf(date, tz, dayStart)`
  (`db.dayOf()` no app), nunca por `localParts(...).day`. O dia fica gravado
  em cada copo (índice `by_day`), então mudar a virada chama
  `db.rekeyIntakes()`. A janela dos lembretes continua no dia de calendário, e
  `configError` exige `start >= dayStart`. Config sem `dayStart` vale `00:00`.
- **Os avisos saem por período, e só pra quem está atrasado.** A janela é
  cortada em manhã (até 12h), tarde (até 18h) e noite (até `end`), e a meta
  se divide pelas horas de cada um, acumulada e arredondada em 50 ml
  (`nudgePoints`). Cada período avisa no meio e 45 min antes do fim, se o
  total do dia estiver abaixo do esperado ali. Cada momento sai uma vez só
  (`lastSentAt`), e um momento perdido é substituído pelo seguinte. Não há
  mais `intervalMin` nem `stopAtGoal`.
- **`DB_NAME = 'gole'` não muda.** Trocar o nome abre um banco vazio.
- **O `html` do `ui.js` apaga `false`.** `aria-expanded="${open}"` com `open`
  falso vira `aria-expanded=""`. Atributo booleano passa por `String(valor)`.
- **Arquivos `*.test.js` não são publicados** (`www/.assetsignore`).

## Telas

- `#/` **Hoje** (`views/today.js`): baiacu, botão do copo (`glassMl`),
  "Outra quantidade" (atalhos e campo livre), card dos últimos 7 dias e os
  copos de hoje por período (`byPeriod`, só o atual aberto). O card é a
  entrada do Histórico: de propósito, não há ícone dele no topo, só a
  engrenagem.
- `#/historico` e `#/dia?d=AAAA-MM-DD`: gráfico, totais e copos esquecidos.
- `#/ajustes` (`views/settings.js`): índice com o liga/desliga dos lembretes
  e uma linha de resumo por grupo. As subtelas são `/ajustes/meta`,
  `/ajustes/lembretes` (com a barra do dia), `/ajustes/virada` e
  `/ajustes/servidor` (token). `#/meta` é a calculadora e volta pra
  `/ajustes/meta`.
- `#/bebi?lembrete=` é o toque na notificação (registra e cai no Hoje).

## Testes

Só os módulos puros e o Worker são testados. Os seams são:
- `reminder.js`: `isDue`/`dueNudge`, `nextReminder`, `nudgePoints`,
  `configError`, `dayOf`
- `intake.js`: `daySummary`, `history` (totais por dia, média só dos dias
  com registro, dias na meta e sequência, onde hoje incompleto não quebra a
  sequência) e `atLocal(day, 'HH:MM', tz, dayStart)`, que dá o instante de
  um copo lançado num dia passado (antes da virada, é a madrugada seguinte).
  `parseMl(texto)` lê a quantidade digitada (copo nos Ajustes, "Outro valor").
  `byPeriod(intakes, tz, now)` agrupa os copos de hoje em manhã (05h), tarde
  (12h) e noite (18h às 05h), com total e `when` (past/now/future)
- `schedule.js`: textos e linha do dia dos Ajustes. `daysLabel`,
  `remindersSummary` e `dayTimeline(config)` (janela e cada aviso possível,
  de 0 a 1, numa barra de 24 h que começa em `dayStart`)
- `hydration.js`: `estimateWater(profile)`. A conta principal usa ml/kg por
  faixa de idade (40, 35, 30 e 25), mais exercício (500 ml/h, o piso do ACSM),
  calor (+500) e gestação ou amamentação (+300/+700, EFSA). Também compara com
  a superfície corporal (Mosteller × 1.500 ml/m²) e com a EFSA (2,0 L
  mulheres, 2,5 L homens). Só o peso é obrigatório.
- `worker/src/cron.js`: `handleCron({ kv, send, now })`
- `worker/src/api.js`: `handleApi(request, deps)`

KV e `send` são fakes, e o push service é a única fronteira mockada. `db.js`,
`push.js` e as views tocam DOM, IndexedDB ou PushManager e não rodam sob
`node --test`. Lógica nova vai pra um módulo puro.

## Visual

O mascote é um baiacu, e ele é o medidor da meta: `www/js/puffer.js` desenha
o SVG inflado conforme o progresso do dia (`mount` anima na tela Hoje e
engole a cada copo, `still` é a versão parada). O ícone do app é outro
desenho, mais simples, em `scripts/icon-art.mjs`: depois de mexer nele, rode
`node scripts/icons.mjs` pra gerar o SVG e os PNGs. O estilo
global de `svg` (ícones de traço) não pode vazar pro peixe; `.fish svg`
desfaz isso.

A paleta é água clara no tema claro e fundo do mar no escuro, com o accent
azul (`#1778bd` / `#5cc4ff`) e o amarelo do baiacu (`#ffc53d`) nos botões
principais, com borda e sombra dura de adesivo. O app segue o tema do
sistema. Figtree é a fonte da interface, e Bagel Fat One (só peso 400) é a
dos números e do título. Inputs usam 16px (abaixo disso o Safari dá zoom).
Caminhos são sempre relativos, e nada é carregado de fora.
