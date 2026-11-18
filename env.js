/* ==========================================================================
   Gestor SENAI — configuração de ambiente (front-end)
   --------------------------------------------------------------------------
   • Rodando localmente (localhost / 127.0.0.1) → usa a API local na porta 8000.
   • Rodando na Vercel (ou qualquer domínio público) → usa a API no Render.

   Assim o mesmo arquivo serve para desenvolvimento e produção, sem precisar
   trocar a URL antes de cada commit.
   ========================================================================== */
(function () {
  'use strict';

  const API_PRODUCAO = 'https://gestor-app-to6m.onrender.com';

  const host = window.location.hostname;
  const ehLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '';

  window.GESTOR_ENV = Object.freeze({
    API_BASE_URL: ehLocal ? `http://${host}:8000` : API_PRODUCAO
  });
})();
