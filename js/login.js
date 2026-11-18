/* ==========================================================================
   Gestor SENAI — tela de login
   Envia matrícula/senha para POST /auth/login e encaminha por papel.
   ========================================================================== */

(function () {
  'use strict';

  const API = window.GestorAPI;
  const form = document.getElementById('loginForm');
  const campoMatricula = document.getElementById('matricula');
  const campoSenha = document.getElementById('senha');
  const wrapperMatricula = campoMatricula?.closest('.login-field');
  const wrapperSenha = campoSenha?.closest('.login-field');

  function marcarErro(campo, wrapper, temErro) {
    if (wrapper) wrapper.classList.toggle('is-invalid', !!temErro);
    if (campo) campo.setAttribute('aria-invalid', temErro ? 'true' : 'false');
  }
  const botao = document.getElementById('btnEntrar');
  const rotuloBotao = document.getElementById('btnEntrarLabel');
  const iconeBotao = document.getElementById('btnEntrarIcon');
  const spinner = document.getElementById('btnEntrarSpinner');
  const toggleSenha = document.getElementById('toggleSenha');
  const toggleIcone = document.getElementById('toggleSenhaIcon');
  const feedback = document.getElementById('loginFeedback');
  const feedbackTexto = document.getElementById('loginFeedbackText');
  const feedbackIcone = document.getElementById('loginFeedbackIcon');

  if (!API) {
    console.error('[Gestor SENAI] js/sessao.js não foi carregado.');
    return;
  }

  const DESTINOS = {
    aluno: 'index.html',
    coordenacao: 'dashboard.html'
  };

  function destinoDoPapel(papel) {
    return DESTINOS[papel] || 'index.html';
  }

  function esconderFeedback() {
    if (!feedback) return;
    feedback.classList.add('hidden');
    feedback.classList.remove('flex');
  }

  function mostrarFeedback(tipo, mensagem) {
    if (!feedback || !feedbackTexto || !feedbackIcone) return;

    const tons = {
      erro: {
        caixa: 'border-rose-200 bg-rose-50 text-rose-700',
        icone: 'ph-warning-circle'
      },
      atencao: {
        caixa: 'border-amber-200 bg-amber-50 text-amber-800',
        icone: 'ph-info'
      },
      sucesso: {
        caixa: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        icone: 'ph-check-circle'
      }
    };
    const tom = tons[tipo] || tons.atencao;

    feedback.className = `mt-5 flex items-start gap-2.5 rounded-xl border p-3 text-[10px] ${tom.caixa}`;
    feedbackIcone.className = `ph ${tom.icone} mt-0.5 text-[15px]`;
    feedbackTexto.textContent = mensagem;
  }

  function definirCarregando(ativo) {
    if (!botao) return;
    botao.disabled = ativo;
    botao.setAttribute('aria-busy', String(ativo));
    if (rotuloBotao) rotuloBotao.textContent = ativo ? 'Entrando…' : 'Entrar';
    if (iconeBotao) iconeBotao.classList.toggle('hidden', ativo);
    if (spinner) spinner.classList.toggle('hidden', !ativo);
  }

  function mensagemDoMotivo() {
    const motivo = new URLSearchParams(window.location.search).get('motivo');
    if (!motivo) return null;

    if (motivo === 'sessao') {
      return 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.';
    }
    if (motivo === 'permissao') {
      return 'Sua conta não tem permissão para acessar essa tela.';
    }
    if (motivo === 'login') {
      return 'Entre com sua matrícula e senha para acessar o Gestor SENAI.';
    }
    return 'Entre novamente para continuar.';
  }

  /* ------------------------------------------------------------------ */
  /* Já autenticado? Encaminha direto para a tela do papel.              */
  /* ------------------------------------------------------------------ */

  async function verificarSessaoExistente() {
    if (!API.token()) return;

    try {
      const dados = await API.requisitar('/auth/me', { redirecionar: false });
      const papel = dados?.usuario?.papel;
      if (!papel) throw new Error('Sessão sem papel definido.');
      API.salvarSessao(API.token(), dados.usuario);
      window.location.replace(destinoDoPapel(papel));
    } catch (erro) {
      // Token inválido/expirado: limpa e deixa a tela de login disponível.
      // Falha de rede não apaga a sessão; o usuário pode tentar de novo.
      if (erro instanceof API.ErroSessao) {
        API.limparSessao();
      } else {
        console.warn('[Gestor SENAI] Não foi possível validar a sessão agora.', erro);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Login                                                               */
  /* ------------------------------------------------------------------ */

  // Limpa o estado de erro ao digitar.
  campoMatricula?.addEventListener('input', () => marcarErro(campoMatricula, wrapperMatricula, false));
  campoSenha?.addEventListener('input', () => marcarErro(campoSenha, wrapperSenha, false));

  form?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    esconderFeedback();

    const matricula = campoMatricula?.value.trim() || '';
    const senha = campoSenha?.value || '';

    marcarErro(campoMatricula, wrapperMatricula, false);
    marcarErro(campoSenha, wrapperSenha, false);

    if (matricula.length < 3) {
      mostrarFeedback('atencao', 'Informe sua matrícula ou CPF.');
      marcarErro(campoMatricula, wrapperMatricula, true);
      campoMatricula?.focus();
      return;
    }

    if (senha.length < 4) {
      mostrarFeedback('atencao', 'Informe sua senha.');
      marcarErro(campoSenha, wrapperSenha, true);
      campoSenha?.focus();
      return;
    }

    definirCarregando(true);

    try {
      const dados = await API.requisitar('/auth/login', {
        metodo: 'POST',
        corpo: { matricula, senha },
        redirecionar: false
      });

      if (!dados?.access_token) {
        throw new API.ErroAPI('Resposta de login inválida.', 500);
      }

      API.salvarSessao(dados.access_token, dados.usuario);

      const destino = destinoDoPapel(dados.usuario?.papel);
      window.location.replace(destino);
    } catch (erro) {
      definirCarregando(false);

      if (erro instanceof API.ErroRede) {
        mostrarFeedback('erro', erro.message);
        return;
      }

      if (erro.status === 401) {
        mostrarFeedback('erro', 'Matrícula ou senha inválidos. Confira os dados e tente novamente.');
        marcarErro(campoMatricula, wrapperMatricula, true);
        marcarErro(campoSenha, wrapperSenha, true);
        campoSenha?.focus();
        campoSenha?.select();
        return;
      }

      mostrarFeedback('erro', API.mensagemDeErro(erro));
    }
  });

  /* ------------------------------------------------------------------ */
  /* Mostrar/ocultar senha e preenchimento de demonstração               */
  /* ------------------------------------------------------------------ */

  toggleSenha?.addEventListener('click', () => {
    const visivel = campoSenha?.type === 'text';
    if (campoSenha) campoSenha.type = visivel ? 'password' : 'text';

    toggleSenha.setAttribute('aria-pressed', String(!visivel));
    toggleSenha.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
    if (toggleIcone) {
      toggleIcone.className = visivel ? 'ph ph-eye text-[16px]' : 'ph ph-eye-slash text-[16px]';
    }
  });

  document.querySelectorAll('[data-demo]').forEach((botaoDemo) => {
    botaoDemo.addEventListener('click', () => {
      const coord = botaoDemo.dataset.demo === 'coord';
      if (campoMatricula) campoMatricula.value = coord ? 'coord01' : '202604178821';
      if (campoSenha) campoSenha.value = 'senai123';
      esconderFeedback();
      campoSenha?.focus();
    });
  });

  const aviso = mensagemDoMotivo();
  if (aviso) mostrarFeedback('atencao', aviso);

  verificarSessaoExistente();
})();
