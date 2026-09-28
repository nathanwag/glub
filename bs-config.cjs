// Servidor de dev (npm run dev): serve www/ com live reload e imprime uma
// "External URL" pro celular na mesma WiFi. Fica fora de www/, entao nao e
// publicado no Pages. Precisa ser .cjs: package.json tem "type": "module".
//
// /phone mostra o app num iframe do tamanho de um celular. Service worker e
// push NAO funcionam aqui (http://) — sao testados na URL do GitHub Pages.

const PHONE = `<!doctype html><meta charset="utf-8">
<title>Glub — moldura</title>
<style>
  html,body{margin:0;height:100%;background:#0b0f14;display:grid;place-items:center}
  iframe{width:390px;height:844px;border:0;border-radius:24px;
         box-shadow:0 0 0 10px #1a212b, 0 20px 60px #0008}
</style>
<iframe src="/index.html#/"></iframe>`;

module.exports = {
  server: {
    baseDir: 'www',
    middleware: [
      (req, res, next) => {
        if (req.url.split('?')[0].replace(/\/$/, '') !== '/phone') return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(PHONE);
      },
    ],
  },
  files: 'www/**/*',
  startPath: '/phone',
  open: 'local',
  ghostMode: false,
  notify: false,
  ui: false,
};
