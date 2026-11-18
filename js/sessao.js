/* ==========================================================================
   Gestor SENAI — sessão e acesso à API
   --------------------------------------------------------------------------
   Centraliza:
     • endereço da API
     • token (localStorage) + usuário da sessão
     • fetch autenticado com tratamento de 401/403
     • logout (apaga cookie + token e volta para login.html)

   Carregue este arquivo ANTES de app.js / dashboard.js.
   ========================================================================== */

(function () {
  'use strict';

  const PADRAO_API = 'http://127.0.0.1:8000';

  // Cabeçalhos que atravessam páginas de aviso de túneis
  // (ngrok / localtunnel / VS Code Dev Tunnels).
  const CABECALHOS_TUNNEL = {
    'bypass-tunnel-reminder': 'true',
    'ngrok-skip-browser-warning': 'true',
    'X-Tunnels-Skip-AntiPhishing-Page': 'true'
  };

  // Sobrescrita dinâmica da URL da API:
  //   1) parâmetro de consulta ?api=https://...
  //   2) arquivo env.js (window.GESTOR_ENV.API_BASE_URL)
  //   3) valor guardado no localStorage (último ?api usado)
  //   4) padrão local
  function resolverBaseUrl() {
    // 1) parâmetro ?api= na URL — prioridade máxima e persiste nesta sessão
    //    do navegador (útil para testar o front local contra outra API).
    try {
      const params = new URLSearchParams(window.location.search);
      const daQuery = params.get('api');
      if (daQuery) {
        try { sessionStorage.setItem('gestor-senai.api-override', daQuery); } catch (e) { /* ignora */ }
        try { localStorage.setItem('gestor-senai.api-base-url', daQuery); } catch (e) { /* ignora */ }
        return daQuery.replace(/\/+$/, '');
      }
    } catch (erro) { /* ignora */ }

    // 1.1) override manual salvo nesta sessão (sobrevive à troca de página).
    try {
      const override = sessionStorage.getItem('gestor-senai.api-override');
      if (override) return String(override).replace(/\/+$/, '');
    } catch (erro) { /* ignora */ }

    // 2) env.js (gerado pelo start_ngrok.ps1).
    try {
      const doEnv = window.GESTOR_ENV && window.GESTOR_ENV.API_BASE_URL;
      if (doEnv && String(doEnv).trim()) {
        try { localStorage.setItem('gestor-senai.api-base-url', String(doEnv)); } catch (e) { /* ignora */ }
        return String(doEnv).replace(/\/+$/, '');
      }
    } catch (erro) { /* ignora */ }

    // 3) localStorage (última URL usada em visita anterior).
    try {
      const doStorage = localStorage.getItem('gestor-senai.api-base-url');
      if (doStorage) return String(doStorage).replace(/\/+$/, '');
    } catch (erro) { /* ignora */ }

    // 4) fallback local
    return PADRAO_API;
  }

  const BASE_URL = resolverBaseUrl();
  const CHAVE_TOKEN = 'gestor-senai.token';
  const CHAVE_USUARIO = 'gestor-senai.usuario';
  const PAGINA_LOGIN = 'login.html';

  // O plano free do Render hiberna e pode levar ~50s para acordar.
  // Por isso: aviso amigável na tela após 3s e timeout total de 60s.
  const TIMEOUT_REQUISICAO_MS = 60000;
  const AVISO_SERVIDOR_LENTO_MS = 3000;
  const TIMEOUT_LOGOUT_MS = 5000;

  class ErroAPI extends Error {
    constructor(mensagem, status, detalhe) {
      super(mensagem);
      this.name = 'ErroAPI';
      this.status = status;
      this.detail = detalhe;
    }
  }

  class ErroSessao extends ErroAPI {
    constructor(mensagem, status, detalhe) {
      super(mensagem, status, detalhe);
      this.name = 'ErroSessao';
    }
  }

  class ErroRede extends Error {
    constructor(mensagem) {
      super(mensagem);
      this.name = 'ErroRede';
    }
  }

  function lerJSON(chave) {
    try {
      const valor = localStorage.getItem(chave);
      return valor ? JSON.parse(valor) : null;
    } catch (erro) {
      return null;
    }
  }

  function token() {
    try {
      return localStorage.getItem(CHAVE_TOKEN) || '';
    } catch (erro) {
      return '';
    }
  }

  function usuario() {
    return lerJSON(CHAVE_USUARIO);
  }

  function salvarSessao(accessToken, dadosUsuario) {
    try {
      if (accessToken) localStorage.setItem(CHAVE_TOKEN, accessToken);
      if (dadosUsuario) {
        localStorage.setItem(CHAVE_USUARIO, JSON.stringify(dadosUsuario));
      }
    } catch (erro) {
      console.warn('[Gestor SENAI] Não foi possível guardar a sessão.', erro);
    }
  }

  function limparSessao() {
    try {
      localStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_USUARIO);
    } catch (erro) {
      /* ignora */
    }
  }

  function naPaginaDeLogin() {
    return /\/login\.html$/i.test(window.location.pathname);
  }

  function irParaLogin(motivo) {
    if (naPaginaDeLogin()) return;
    const sufixo = motivo ? `?motivo=${encodeURIComponent(motivo)}` : '';
    window.location.replace(`${PAGINA_LOGIN}${sufixo}`);
  }

  function mensagemDeErro(erro) {
    const detalhe = erro && erro.detail;

    if (typeof detalhe === 'string' && detalhe.trim()) return detalhe;

    if (detalhe && typeof detalhe === 'object') {
      if (typeof detalhe.mensagem === 'string') return detalhe.mensagem;
      if (Array.isArray(detalhe)) {
        return detalhe
          .map((item) => item.msg || item.message || '')
          .filter(Boolean)
          .join(' ');
      }
    }

    if (erro && erro.message) return erro.message;
    return 'Não foi possível concluir a operação.';
  }

  async function detalheDaResposta(resposta) {
    try {
      const corpo = await resposta.json();
      return corpo && 'detail' in corpo ? corpo.detail : corpo;
    } catch (erro) {
      return null;
    }
  }

  /* ------------------------------------------------------------------------
     Aviso "acordando o servidor" (Render free)
     Aparece quando uma requisição demora mais de 3s e some sozinho no fim.
     ---------------------------------------------------------------------- */
  let avisoConexaoEl = null;
  let avisosConexaoAtivos = 0;

  function mostrarAvisoConexao() {
    avisosConexaoAtivos += 1;
    if (avisoConexaoEl || !document.body) return;

    const el = document.createElement('div');
    el.id = 'gestor-aviso-conexao';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent =
      'Acordando o servidor... Isso pode levar até 1 minuto na primeira vez.';
    Object.assign(el.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      maxWidth: 'calc(100vw - 24px)',
      padding: '12px 18px',
      borderRadius: '12px',
      background: 'rgba(13, 47, 87, 0.96)',
      color: '#ffffff',
      font: '600 13px/1.4 "Segoe UI", system-ui, sans-serif',
      textAlign: 'center',
      boxShadow: '0 10px 30px rgba(13, 47, 87, 0.35)',
      pointerEvents: 'none'
    });

    document.body.appendChild(el);
    avisoConexaoEl = el;
  }

  function esconderAvisoConexao() {
    avisosConexaoAtivos = Math.max(0, avisosConexaoAtivos - 1);
    if (avisosConexaoAtivos > 0) return;
    if (avisoConexaoEl && avisoConexaoEl.parentNode) {
      avisoConexaoEl.parentNode.removeChild(avisoConexaoEl);
    }
    avisoConexaoEl = null;
  }

  /**
   * Requisição autenticada.
   *
   * @param {string} caminho  Ex.: '/aluno/agenda'
   * @param {object} opcoes   { metodo, corpo, redirecionar }
   *   redirecionar=true: em 401/403 limpa a sessão e vai para login.html.
   */
  async function requisitar(caminho, opcoes = {}) {
    const { metodo = 'GET', corpo, redirecionar = true } = opcoes;
    const cabecalhos = { Accept: 'application/json', ...CABECALHOS_TUNNEL };
    const valorToken = token();

    if (valorToken) cabecalhos.Authorization = `Bearer ${valorToken}`;

    let body;
    if (corpo !== undefined) {
      cabecalhos['Content-Type'] = 'application/json';
      body = JSON.stringify(corpo);
    }

    const controlador = new AbortController();
    let estourouTempo = false;
    let avisoAtivo = false;

    const timerTimeout = setTimeout(() => {
      estourouTempo = true;
      controlador.abort();
    }, TIMEOUT_REQUISICAO_MS);

    const timerAviso = setTimeout(() => {
      avisoAtivo = true;
      mostrarAvisoConexao();
    }, AVISO_SERVIDOR_LENTO_MS);

    let resposta;
    try {
      resposta = await fetch(`${BASE_URL}${caminho}`, {
        method: metodo,
        headers: cabecalhos,
        body,
        credentials: 'include',
        cache: 'no-store',
        signal: controlador.signal
      });
    } catch (erro) {
      if (estourouTempo) {
        throw new ErroRede(
          'O servidor demorou mais de 60 segundos para responder. ' +
            'No plano gratuito do Render ele pode estar acordando — tente novamente em instantes.'
        );
      }
      throw new ErroRede(
        `Não foi possível conectar à API em ${BASE_URL}. Verifique se o servidor está no ar.`
      );
    } finally {
      clearTimeout(timerTimeout);
      clearTimeout(timerAviso);
      if (avisoAtivo) esconderAvisoConexao();
    }

    if (resposta.status === 401 || resposta.status === 403) {
      const detalhe = await detalheDaResposta(resposta);
      if (redirecionar) {
        limparSessao();
        // Sem token, o usuário apenas chegou sem sessão; não é expiração.
        irParaLogin(resposta.status === 401 && !valorToken ? 'login' : 'sessao');
      }
      throw new ErroSessao(
        typeof detalhe === 'string' ? detalhe : 'Sessão inválida ou sem permissão.',
        resposta.status,
        detalhe
      );
    }

    if (!resposta.ok) {
      const detalhe = await detalheDaResposta(resposta);
      throw new ErroAPI(
        typeof detalhe === 'string' ? detalhe : `Erro ${resposta.status}.`,
        resposta.status,
        detalhe
      );
    }

    if (resposta.status === 204) return null;
    return resposta.json();
  }

  async function sair() {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), TIMEOUT_LOGOUT_MS);

    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          ...CABECALHOS_TUNNEL,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        cache: 'no-store',
        signal: controlador.signal
      });
    } catch (erro) {
      /* sem rede (ou servidor lento): encerra a sessão local mesmo assim */
    } finally {
      clearTimeout(timer);
    }

    limparSessao();

    try {
      sessionStorage.removeItem('gestor-senai.alerta-dispensado');
    } catch (erro) {
      /* ignora */
    }

    window.location.replace(PAGINA_LOGIN);
  }

  window.GestorAPI = Object.freeze({
    BASE_URL,
    CABECALHOS_TUNNEL,
    PAGINA_LOGIN,
    ErroAPI,
    ErroSessao,
    ErroRede,
    token,
    usuario,
    salvarSessao,
    limparSessao,
    irParaLogin,
    mensagemDeErro,
    requisitar,
    sair
  });
})();
