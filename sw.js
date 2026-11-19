/* ==========================================================================
   Gestor SENAI — Service Worker
   --------------------------------------------------------------------------
   Estratégias:
   • Navegação (HTML): network-first com fallback para o app shell em cache.
   • Arquivos do app (css/js/ícones): stale-while-revalidate.
   • CDNs (Tailwind, Google Fonts, Phosphor): stale-while-revalidate em cache
     separado — permite abrir o PWA com boa aparência mesmo offline.
   • Rotas /api/: nunca são cacheadas (dados do back-end Python são sempre
     buscados na rede).
   ========================================================================== */

const VERSAO = '5.4.0';
const CACHE_SHELL = `gestor-senai-shell-v${VERSAO}`;
const CACHE_EXTERNO = `gestor-senai-externo-v${VERSAO}`;
const CACHES_ATUAIS = [CACHE_SHELL, CACHE_EXTERNO];

const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './dashboard.html',
  './manifest.webmanifest',
  './css/styles.css',
  './env.js',
  './js/sessao.js',
  './js/login.js',
  './js/app.js',
  './js/dashboard.js',
  './assets/gestor-senai-logo-escuro.svg',
  './assets/gestor-senai-icone-pwa-maskable.svg',
  './assets/gestor-senai-icone-negativo.svg',
  './assets/gestor-senai-icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png'
];

/* --------------------------------------------------------------------------
   Instalação e ativação
   -------------------------------------------------------------------------- */

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    console.info('[Gestor SENAI SW] Pré-cacheando app shell…');

    // Sequencial e tolerante a falhas: um arquivo ausente não impede o restante.
    let ok = 0;
    for (const caminho of APP_SHELL) {
      try {
        await cache.add(adicionarCabecalhoTunnel(new Request(caminho)));
        ok += 1;
      } catch (erro) {
        console.warn('[Gestor SENAI SW] Não foi possível pré-cachear:', caminho, erro);
      }
    }

    console.info(`[Gestor SENAI SW] App shell: ${ok}/${APP_SHELL.length} arquivos em cache.`);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(
      chaves
        .filter((chave) => chave.startsWith('gestor-senai-') && !CACHES_ATUAIS.includes(chave))
        .map((chave) => caches.delete(chave))
    );

    await self.clients.claim();
    console.info('[Gestor SENAI SW] Ativo. Versão:', VERSAO);
  })());
});

/* --------------------------------------------------------------------------
   Cabeçalhos para túneis (VS Code Dev Tunnels / ngrok / localtunnel)
   -------------------------------------------------------------------------- */

/**
 * Retorna uma cópia da requisição com os cabeçalhos que evitam a página de
 * aviso de segurança. Se o navegador não permitir recriar a Request
 * (alguns navegadores bloqueiam requisições de navegação), a original é
 * devolvida para não quebrar o carregamento do PWA.
 */
function adicionarCabecalhoTunnel(requisicao) {
  const cabecalhos = new Headers(requisicao.headers);
  cabecalhos.set('X-Tunnels-Skip-AntiPhishing-Page', 'true');
  cabecalhos.set('bypass-tunnel-reminder', 'true');
  cabecalhos.set('ngrok-skip-browser-warning', 'true');

  try {
    return new Request(requisicao, { headers: cabecalhos });
  } catch (erro) {
    try {
      return new Request(requisicao.url, { headers: cabecalhos });
    } catch (erro2) {
      return requisicao;
    }
  }
}

/* --------------------------------------------------------------------------
   Estratégias de cache
   -------------------------------------------------------------------------- */

async function responderNavegacao(evento) {
  const requisicao = evento.request;

  try {
    const resposta = await fetch(adicionarCabecalhoTunnel(requisicao));
    if (resposta.ok) {
      const caminho = new URL(requisicao.url).pathname;
      // Só o index é o "app shell"; as demais páginas têm conteúdo próprio.
      if (caminho === '/' || caminho.endsWith('/index.html')) {
        const cache = await caches.open(CACHE_SHELL);
        cache.put('./index.html', resposta.clone());
      }
    }
    return resposta;
  } catch (erro) {
    const cache = await caches.open(CACHE_SHELL);
    const cacheada = await cache.match('./index.html') || await cache.match('./');
    if (cacheada) return cacheada;

    return new Response(paginaOffline(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function responderCritico(evento) {
  const requisicao = evento.request;
  const cache = await caches.open(CACHE_SHELL);
  try {
    const resposta = await fetch(adicionarCabecalhoTunnel(requisicao), { cache: 'no-store' });
    if (resposta.ok) cache.put(requisicao, resposta.clone());
    return resposta;
  } catch (erro) {
    const cacheada = await cache.match(requisicao, { ignoreSearch: true });
    if (cacheada) return cacheada;
    return new Response('Recurso indisponível offline.', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function responderAssetLocal(evento) {
  const requisicao = evento.request;
  const cache = await caches.open(CACHE_SHELL);
  const cacheada = await cache.match(requisicao, { ignoreSearch: true });

  const atualizacao = fetch(adicionarCabecalhoTunnel(requisicao))
    .then((resposta) => {
      if (resposta.ok) cache.put(requisicao, resposta.clone());
      return resposta;
    })
    .catch(() => null);

  if (cacheada) {
    evento.waitUntil(atualizacao);
    return cacheada;
  }

  const resposta = await atualizacao;
  if (resposta) return resposta;

  return new Response('Recurso indisponível offline.', {
    status: 504,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function responderExterno(evento) {
  const requisicao = evento.request;
  const cache = await caches.open(CACHE_EXTERNO);
  const cacheada = await cache.match(requisicao);

  const atualizacao = fetch(adicionarCabecalhoTunnel(requisicao))
    .then((resposta) => {
      if (resposta && (resposta.ok || resposta.type === 'opaque')) {
        cache.put(requisicao, resposta.clone());
      }
      return resposta;
    })
    .catch(() => null);

  if (cacheada) {
    evento.waitUntil(atualizacao);
    return cacheada;
  }

  const resposta = await atualizacao;
  if (resposta) return resposta;

  return new Response('', { status: 504, statusText: 'Offline' });
}

/* --------------------------------------------------------------------------
   Origens externas que podem passar pelo cache (CDNs de aparência)
   -------------------------------------------------------------------------- */

const CDN_EXTERNOS = new Set([
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://unpkg.com'
]);

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Dados do back-end Python: sempre rede, nunca cache.
  if (url.pathname.includes('/api/')) return;

  // Chamadas autenticadas nunca entram no cache (o mesmo URL devolve dados
  // diferentes para cada usuário e não pode ser servido de um token antigo).
  if (requisicao.headers.has('authorization')) return;

  if (requisicao.mode === 'navigate') {
    evento.respondWith(responderNavegacao(evento));
    return;
  }

  // Arquivos críticos para a URL da API (env.js e sessao.js): Network-First,
  // para que atualizações cheguem no iPhone imediatamente.
  const ehCritico = url.pathname.endsWith('/env.js') || url.pathname.endsWith('/js/sessao.js');
  if (ehCritico) {
    evento.respondWith(responderCritico(evento));
    return;
  }

  if (url.origin === self.location.origin) {
    evento.respondWith(responderAssetLocal(evento));
    return;
  }

  // Qualquer outra origem (inclusive a API em 127.0.0.1:8000) vai direto
  // para a rede; só os CDNs de aparência usam o cache offline.
  if (!CDN_EXTERNOS.has(url.origin)) return;

  evento.respondWith(responderExterno(evento));
});

/* --------------------------------------------------------------------------
   Web Push (o back-end Python pode enviar via pywebpush / VAPID)
   -------------------------------------------------------------------------- */

self.addEventListener('push', (evento) => {
  let dados = {};

  try {
    dados = evento.data ? evento.data.json() : {};
  } catch (erro) {
    dados = { body: evento.data ? evento.data.text() : '' };
  }

  const titulo = dados.title || 'Gestor SENAI';
  const opcoes = {
    body: dados.body || 'Você tem um novo aviso da coordenação.',
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    tag: dados.tag || 'gestor-senai-aviso',
    data: { url: dados.url || './index.html#avisos' }
  };

  evento.waitUntil((async () => {
    try {
      await self.registration.showNotification(titulo, opcoes);
    } catch (erro) {
      console.error('[Gestor SENAI SW] Falha ao exibir notificação:', erro);
      try {
        await self.registration.showNotification('Gestor SENAI', {
          body: 'Você tem um novo aviso. Abra o app para ver.',
          icon: './assets/icon-192.png',
          badge: './assets/icon-192.png',
          tag: 'gestor-senai-aviso'
        });
      } catch (erro2) {
        console.error('[Gestor SENAI SW] Falha no fallback de notificação:', erro2);
      }
    }
  })());
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();

  const destino = new URL(
    evento.notification.data?.url || './index.html#avisos',
    self.registration.scope
  ).href;

  evento.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const cliente of clientes) {
      if ('focus' in cliente) {
        await cliente.focus();
        if ('navigate' in cliente) await cliente.navigate(destino);
        return;
      }
    }

    if (self.clients.openWindow) await self.clients.openWindow(destino);
  })());
});

/* --------------------------------------------------------------------------
   Mensagens da página (ex.: ativar nova versão imediatamente)
   -------------------------------------------------------------------------- */

self.addEventListener('message', (evento) => {
  if (evento.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/* --------------------------------------------------------------------------
   Página de contingência (sem cache e sem rede)
   -------------------------------------------------------------------------- */

function paginaOffline() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#003B5C" />
  <title>Gestor SENAI · Offline</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; display: grid; place-items: center;
      padding: 24px; background: #F5F7FA; color: #003B5C;
      font-family: Poppins, ui-sans-serif, system-ui, sans-serif; text-align: center;
    }
    main { max-width: 380px; }
    .icon {
      width: 84px; height: 84px; margin: 0 auto 20px; display: grid;
      place-items: center; border-radius: 24px; background: #003B5C;
      box-shadow: 0 20px 40px -22px rgba(0, 59, 92, .7);
    }
    .icon span {
      display: block; width: 40px; height: 36px; border-radius: 10px;
      background: #FFFFFF; position: relative;
    }
    .icon span::after {
      content: ''; position: absolute; right: 4px; bottom: 4px;
      width: 10px; height: 10px; border-radius: 50%; background: #F26522;
    }
    h1 { font-size: 20px; margin: 0 0 8px; letter-spacing: -.02em; }
    p { font-size: 13px; line-height: 1.6; color: #64748B; margin: 0 0 20px; }
    button {
      border: 0; border-radius: 12px; background: #003B5C; color: #fff;
      padding: 12px 20px; font: inherit; font-size: 12px; font-weight: 600;
      cursor: pointer;
    }
    button:active { transform: scale(.98); }
  </style>
</head>
<body>
  <main>
    <div class="icon" aria-hidden="true"><span></span></div>
    <h1>Você está offline</h1>
    <p>O Gestor SENAI não conseguiu carregar a agenda agora. Verifique sua conexão e tente novamente.</p>
    <button onclick="location.reload()">Tentar novamente</button>
  </main>
</body>
</html>`;
}
