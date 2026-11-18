/* ==========================================================================
   Gestor SENAI — app.js (PWA do aluno)
   --------------------------------------------------------------------------
   Organização:
     1. Configuração
     2. Camada de dados (demonstração + ponto de integração com o back-end)
     3. Utilidades e renderização
     4. Navegação entre telas
     5. Alertas, toast e detalhes da aula
     6. Notificações (Notification API)
     7. Instalação do PWA
     8. Service Worker + diagnóstico de identidade visual
     9. Inicialização
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONFIGURAÇÃO
   ========================================================================== */

const CONFIG = Object.freeze({
  VERSAO: '1.0.0',

  /**
   * API do Gestor SENAI (backend/). O endereço também está em js/sessao.js.
   * Produção: 'https://api.gestorsenai.com.br/v1'
   */
  API_BASE_URL: (window.GestorAPI && window.GestorAPI.BASE_URL) || 'http://127.0.0.1:8000',

  /**
   * Contrato sugerido para o back-end. Todos os endpoints devem responder JSON.
   *
   * GET {API_BASE_URL}/aluno/perfil
   * { "nome": "...", "nomeCompleto": "...", "iniciais": "JV",
   *   "matricula": "...", "curso": "...", "unidade": "...", "turno": "Tarde" }
   *
   * GET {API_BASE_URL}/aluno/agenda
   * {
   *   "aluno": { ... },
   *   "proximaAulaId": "aula-clp-14",
   *   "alerta": { "id": "...", "titulo": "...", "texto": "...", "hora": "agora", "aulaId": "..." },
   *   "dias": [
   *     { "data": "2026-11-16", "aulas": [
   *       { "id": "...", "inicio": "14:00", "fim": "16:00", "duracao": "2h",
   *         "titulo": "...", "subtitulo": "...", "sala": "Lab 05", "salaAnterior": "Lab 04",
   *         "instrutor": "Rafael Lima", "iniciais": "RL", "tipo": "prática",
   *         "alterada": true, "direcoes": "Bloco B, 2º andar..." }
   *     ] }
   *   ],
   *   "avisos": [
   *     { "id": "...", "tipo": "sala|material|evento|cancelamento|sistema",
   *       "titulo": "...", "texto": "...", "quando": "agora", "lida": false, "aulaId": "..." }
   *   ]
   * }
   *
   * GET {API_BASE_URL}/aluno/eventos  → SSE (text/event-stream) para tempo real.
   * Evento: "mudanca-sala" com { "aulaId": "...", "novaSala": "Lab 05", "mensagem": "..." }
   */
  ENDPOINTS: Object.freeze({
    perfil: '/aluno/perfil',
    agenda: '/aluno/agenda',
    avisos: '/aluno/avisos',
    eventos: '/aluno/eventos'
  })
});

const TELAS = ['inicio', 'agenda', 'avisos', 'perfil'];

const TITULOS_TELA = {
  inicio: 'Minha agenda',
  agenda: 'Agenda',
  avisos: 'Avisos',
  perfil: 'Perfil'
};

/* ==========================================================================
   2. CAMADA DE DADOS
   --------------------------------------------------------------------------
   Todos os dados vêm da API do Gestor SENAI (backend/).
   Sem sessão válida, o app redireciona para login.html.
   ========================================================================== */

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function calcularDuracao(inicio, fim) {
  const [h1, m1] = inicio.split(':').map(Number);
  const [h2, m2] = fim.split(':').map(Number);
  const minutos = (h2 * 60 + m2) - (h1 * 60 + m1);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto}min`;
  return resto ? `${horas}h${String(resto).padStart(2, '0')}` : `${horas}h`;
}

/**
 * Cria uma aula já com valores padrão. O back-end pode enviar apenas os
 * campos que mudam; a interface continua robusta.
 */
function criarAula(dados) {
  const inicio = dados.inicio || '08:00';
  const fim = dados.fim || '09:30';

  return {
    id: dados.id || `aula-${inicio}-${dados.titulo || 'geral'}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    inicio,
    fim,
    duracao: dados.duracao || calcularDuracao(inicio, fim),
    titulo: dados.titulo || 'Aula',
    subtitulo: dados.subtitulo || '',
    sala: dados.sala || 'Sala 01',
    salaAnterior: dados.salaAnterior || null,
    instrutor: dados.instrutor || 'Instrutor',
    iniciais: dados.iniciais || 'IN',
    tipo: dados.tipo || 'teórica',
    alterada: Boolean(dados.alterada),
    direcoes: dados.direcoes || 'Consulte a coordenação para mais informações sobre o local.'
  };
}

function dataLocalISO(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

/**
 * Estado vazio: a interface só é renderizada depois que a API responde.
 * Não existem mais dados de demonstração no app.
 */
function dadosVazios() {
  return {
    aluno: null,
    proximaAulaId: null,
    alerta: null,
    dias: [],
    avisos: []
  };
}


/* ==========================================================================
   Estado da aplicação
   ========================================================================== */

const estado = {
  dados: dadosVazios(),
  diaSelecionado: 0,
  aulaAbertaId: null,
  ultimoFoco: null,
  promptInstalacao: null,
  toastTimer: null,
  backendConectado: false
};

const CHAVE_ALERTA = 'gestor-senai.alerta-dispensado';

/* ==========================================================================
   3. UTILIDADES E RENDERIZAÇÃO
   ========================================================================== */

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

function texto(id, valor) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = valor ?? '';
}

function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[caractere]));
}

function capitalizar(valor) {
  return valor.charAt(0).toUpperCase() + valor.slice(1);
}

function formatarDataLonga(data) {
  return `${capitalizar(DIAS_SEMANA[data.getDay()])}, ${data.getDate()} de ${MESES[data.getMonth()]}`;
}

function formatarDataCurta(data) {
  return `${data.getDate()} de ${MESES[data.getMonth()]}`;
}

/**
 * Converte a data/hora ISO da API em texto curto ("agora", "há 10 min").
 * Se já vier texto (demonstração antiga), devolve como está.
 */
function tempoRelativo(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);

  const minutos = Math.floor((Date.now() - data.getTime()) / 60000);

  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function normalizarDados(dados) {
  const dias = Array.isArray(dados?.dias) ? dados.dias : [];
  const avisos = Array.isArray(dados?.avisos) ? dados.avisos : [];

  return {
    ...dados,
    aluno: dados?.aluno || null,
    alerta: dados?.alerta || null,
    avisos: avisos.map((aviso) => ({
      ...aviso,
      quando: tempoRelativo(aviso.quando)
    })),
    dias: dias.map((dia) => ({
      ...dia,
      data: dia.data instanceof Date ? dia.data : new Date(`${dia.data}T12:00:00`),
      aulas: Array.isArray(dia.aulas) ? dia.aulas.map(criarAula) : []
    }))
  };
}

function encontrarAula(id) {
  for (const dia of estado.dados.dias) {
    const aula = dia.aulas.find((item) => item.id === id);
    if (aula) return aula;
  }
  return null;
}

function obterDiaHoje() {
  return estado.dados.dias[0] || { data: new Date(), aulas: [] };
}

function obterProximaAula() {
  return encontrarAula(estado.dados.proximaAulaId) || obterDiaHoje().aulas[0] || null;
}

function contarNaoLidos() {
  return estado.dados.avisos.filter((aviso) => !aviso.lida).length;
}

/* ---------------------------- Cabeçalho ---------------------------------- */

function atualizarCabecalho() {
  const aluno = estado.dados.aluno;
  const hoje = new Date();

  texto('dataHoje', formatarDataLonga(hoje));
  if (!aluno) return;

  texto('saudacaoNome', aluno.nome);
  texto('turnoAluno', aluno.turno);
  texto('saudacaoTurno', `Turno da ${String(aluno.turno).toLowerCase()}`);
}

/* ---------------------------- Início ------------------------------------- */

function renderizarHome() {
  const hoje = obterDiaHoje();
  const aulas = hoje.aulas;
  const proxima = obterProximaAula();

  /* Resumo */
  texto('resumoAulas', aulas.length);
  texto('resumoLabs', new Set(aulas.filter((aula) => /lab/i.test(aula.sala)).map((aula) => aula.sala)).size);
  texto('resumoAlteracoes', aulas.filter((aula) => aula.alterada).length);

  /* Alerta em tempo real */
  const alerta = estado.dados.alerta;
  const alertBand = $('#alertBand');
  let alertaDispensado = false;

  try {
    alertaDispensado = sessionStorage.getItem(CHAVE_ALERTA) === String(alerta?.id);
  } catch (erro) {
    alertaDispensado = false;
  }

  if (alertBand) {
    alertBand.hidden = !alerta || alertaDispensado;
    if (alerta) {
      texto('alertTitulo', alerta.titulo);
      texto('alertTexto', alerta.texto);
      texto('alertHora', alerta.hora || 'agora');
      const botaoDetalhes = $('#alertDetalhes');
      if (botaoDetalhes) botaoDetalhes.hidden = !alerta.aulaId;
    }
  }

  /* Próxima aula */
  if (!proxima) return;

  texto('nextClassTime', `${proxima.inicio} — ${proxima.fim}`);
  texto('nextClassDuration', proxima.duracao);
  texto('nextClassName', proxima.titulo);
  texto('nextClassSubtitle', proxima.subtitulo);
  texto('nextClassRoom', proxima.sala);
  texto('nextClassTeacherName', proxima.instrutor);
  texto('nextClassTeacherInitials', proxima.iniciais);

  const status = $('#nextClassStatus');
  if (status) status.classList.toggle('hidden', !proxima.alterada);

  /* Resto do dia */
  const restantes = aulas.filter((aula) => aula.id !== proxima.id);
  const lista = $('#restOfDayList');

  if (lista) {
    lista.innerHTML = restantes.length
      ? restantes.map(templateAulaCompacta).join('')
      : '<p class="rounded-xl border border-dashed border-senai-line bg-white px-4 py-5 text-center text-[10.5px] text-slate-600">Nenhuma aula restante hoje. Bom descanso!</p>';
  }

  texto('restOfDayCount', restantes.length === 1 ? 'Mais 1 aula hoje' : `Mais ${restantes.length} aulas hoje`);
}

function templateAulaCompacta(aula) {
  const badge = aula.alterada
    ? '<span class="rounded bg-senai-orange/10 px-1.5 py-0.5 text-[7.5px] font-semibold uppercase tracking-wider text-senai-orangeDeep">Sala alterada</span>'
    : `<span class="rounded ${aula.tipo === 'prática' ? 'bg-orange-50 text-senai-orangeDeep' : 'bg-slate-100 text-slate-600'} px-1.5 py-0.5 text-[7.5px] font-semibold uppercase tracking-wider">${escaparHTML(capitalizar(aula.tipo))}</span>`;

  const corBarra = aula.alterada ? 'bg-senai-orange' : 'bg-senai-dark';
  const corPin = aula.alterada ? 'text-senai-orange' : 'text-slate-600';
  const destaqueSala = aula.alterada ? 'font-medium text-senai-dark' : '';

  return `
    <button
      type="button"
      data-aula-id="${escaparHTML(aula.id)}"
      class="press group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-senai-line bg-white py-3.5 pl-5 pr-3.5 text-left shadow-sm hover:-translate-y-0.5 hover:border-senai-orange/25 hover:shadow-md"
    >
      <span class="absolute inset-y-3 left-0 w-[3px] rounded-r-full ${corBarra}"></span>
      <span class="w-[46px] shrink-0">
        <span class="tnum block text-[12.5px] font-semibold leading-none text-senai-dark">${escaparHTML(aula.inicio)}</span>
        <span class="mt-1 block text-[8.5px] font-medium uppercase tracking-[.1em] text-slate-600">${escaparHTML(aula.duracao)}</span>
      </span>
      <span class="h-9 w-px bg-senai-line"></span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5">
          <span class="truncate text-[12.5px] font-semibold text-senai-dark">${escaparHTML(aula.titulo)}</span>
          ${badge}
        </span>
        <span class="mt-1 flex items-center gap-1.5 text-[10px] text-slate-600">
          <i class="ph ph-map-pin text-[11px] ${corPin}"></i>
          <span class="${destaqueSala}">${escaparHTML(aula.sala)}</span>
          <span class="h-[3px] w-[3px] rounded-full bg-slate-300"></span>
          <span class="truncate">${escaparHTML(aula.instrutor)}</span>
        </span>
      </span>
      <i class="ph ph-caret-right shrink-0 text-[13px] text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-senai-orange"></i>
    </button>
  `;
}

/* ---------------------------- Agenda ------------------------------------- */

function renderizarTrilhaDeDias() {
  const trilha = $('#agendaDayStrip');
  if (!trilha) return;

  trilha.innerHTML = estado.dados.dias.map((dia, indice) => {
    const data = new Date(dia.data);
    const ativo = indice === estado.diaSelecionado;
    const ehHoje = indice === 0;

    return `
      <button
        type="button"
        role="tab"
        aria-selected="${ativo}"
        data-dia-index="${indice}"
        class="day-chip ${ativo ? 'is-active' : ''} ${ehHoje ? 'is-today' : ''} flex w-[54px] shrink-0 flex-col items-center rounded-xl px-2 py-2.5"
      >
        <span class="text-[8.5px] font-semibold uppercase tracking-[.1em]">${escaparHTML(DIAS_CURTOS[data.getDay()])}</span>
        <span class="tnum mt-0.5 text-[15px] font-semibold">${String(data.getDate()).padStart(2, '0')}</span>
        <span class="mt-1 h-1 w-1 rounded-full ${dia.aulas.length ? 'bg-current opacity-60' : 'bg-transparent'}"></span>
      </button>
    `;
  }).join('');
}

function renderizarAgendaDia(indice = estado.diaSelecionado) {
  const dia = estado.dados.dias[indice] || estado.dados.dias[0];
  if (!dia) return;

  estado.diaSelecionado = indice;
  const data = new Date(dia.data);

  $$('[data-dia-index]').forEach((botao) => {
    const ativo = Number(botao.dataset.diaIndex) === indice;
    botao.classList.toggle('is-active', ativo);
    botao.setAttribute('aria-selected', String(ativo));
  });

  texto('agendaDiaTitulo', indice === 0 ? 'Hoje' : capitalizar(DIAS_SEMANA[data.getDay()]));
  texto('agendaResumo', `${dia.aulas.length} ${dia.aulas.length === 1 ? 'aula' : 'aulas'} · ${formatarDataCurta(data)}`);

  const lista = $('#agendaList');
  if (!lista) return;

  if (!dia.aulas.length) {
    lista.innerHTML = `
      <div class="rounded-2xl border border-dashed border-senai-line bg-white px-5 py-8 text-center">
        <i class="ph ph-coffee text-[24px] text-slate-300"></i>
        <p class="mt-2 text-[11px] font-medium text-senai-dark">Sem aulas neste dia</p>
        <p class="mt-1 text-[10px] text-slate-600">Aproveite para revisar os conteúdos da semana.</p>
      </div>
    `;
    return;
  }

  lista.innerHTML = dia.aulas.map((aula) => {
    const badge = aula.alterada
      ? '<span class="rounded bg-senai-orange/10 px-1.5 py-0.5 text-[7.5px] font-semibold uppercase tracking-wider text-senai-orangeDeep">Sala alterada</span>'
      : `<span class="rounded ${aula.tipo === 'prática' ? 'bg-orange-50 text-senai-orangeDeep' : 'bg-slate-100 text-slate-600'} px-1.5 py-0.5 text-[7.5px] font-semibold uppercase tracking-wider">${escaparHTML(capitalizar(aula.tipo))}</span>`;

    return `
      <button
        type="button"
        data-aula-id="${escaparHTML(aula.id)}"
        class="press group flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-senai-line bg-white p-3.5 text-left shadow-sm hover:-translate-y-0.5 hover:border-senai-orange/25 hover:shadow-md"
      >
        <span class="relative flex w-[52px] shrink-0 flex-col items-center justify-center rounded-xl bg-senai-mist px-1 py-2">
          <span class="tnum text-[13px] font-semibold leading-none text-senai-dark">${escaparHTML(aula.inicio)}</span>
          <span class="mt-1 text-[8.5px] font-medium uppercase tracking-[.08em] text-slate-600">${escaparHTML(aula.fim)}</span>
          ${aula.alterada ? '<span class="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-senai-orange"></span>' : ''}
        </span>

        <span class="min-w-0 flex-1 py-0.5">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-[12.5px] font-semibold text-senai-dark">${escaparHTML(aula.titulo)}</span>
            ${badge}
          </span>
          <span class="mt-0.5 block truncate text-[9.5px] text-slate-600">${escaparHTML(aula.subtitulo)}</span>
          <span class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-slate-600">
            <span class="inline-flex items-center gap-1">
              <i class="ph ph-map-pin text-[11px] ${aula.alterada ? 'text-senai-orange' : 'text-slate-600'}"></i>
              <span class="${aula.alterada ? 'font-medium text-senai-dark' : ''}">${escaparHTML(aula.sala)}</span>
            </span>
            <span class="h-[3px] w-[3px] rounded-full bg-slate-300"></span>
            <span class="truncate">${escaparHTML(aula.instrutor)}</span>
          </span>
        </span>

        <i class="ph ph-caret-right self-center shrink-0 text-[13px] text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-senai-orange"></i>
      </button>
    `;
  }).join('');
}

/* ---------------------------- Avisos ------------------------------------- */

const TIPOS_AVISO = {
  sala: {
    icone: 'ph-door-open',
    classes: 'bg-senai-orange/10 text-senai-orangeDeep',
    etiqueta: 'Mudança de sala'
  },
  material: {
    icone: 'ph-file-text',
    classes: 'bg-sky-50 text-sky-600',
    etiqueta: 'Material'
  },
  evento: {
    icone: 'ph-confetti',
    classes: 'bg-emerald-50 text-emerald-600',
    etiqueta: 'Evento'
  },
  cancelamento: {
    icone: 'ph-x-circle',
    classes: 'bg-rose-50 text-rose-500',
    etiqueta: 'Cancelamento'
  },
  sistema: {
    icone: 'ph-info',
    classes: 'bg-slate-100 text-slate-600',
    etiqueta: 'Sistema'
  }
};

function renderizarAvisos() {
  const lista = $('#noticesList');
  if (!lista) return;

  if (!estado.dados.avisos.length) {
    lista.innerHTML = `
      <div class="rounded-2xl border border-dashed border-senai-line bg-white px-5 py-8 text-center">
        <i class="ph ph-bell-slash text-[24px] text-slate-300"></i>
        <p class="mt-2 text-[11px] font-medium text-senai-dark">Nenhum aviso por aqui</p>
        <p class="mt-1 text-[10px] text-slate-600">Você está em dia com a coordenação.</p>
      </div>
    `;
  } else {
    lista.innerHTML = estado.dados.avisos.map((aviso) => {
      const tipo = TIPOS_AVISO[aviso.tipo] || TIPOS_AVISO.sistema;

      return `
        <article class="overflow-hidden rounded-2xl border ${aviso.lida ? 'border-senai-line' : 'border-senai-orange/25'} bg-white shadow-sm">
          <button type="button" data-aviso-id="${escaparHTML(aviso.id)}" class="press flex w-full items-start gap-3 p-3.5 text-left">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tipo.classes}">
              <i class="ph ${tipo.icone} text-[17px]"></i>
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2">
                <span class="text-[8px] font-semibold uppercase tracking-[.14em] text-slate-600">${escaparHTML(tipo.etiqueta)}</span>
                <span class="ml-auto shrink-0 text-[9px] text-slate-600">${escaparHTML(aviso.quando)}</span>
              </span>
              <span class="mt-1 block text-[11.5px] font-semibold leading-snug text-senai-dark">${escaparHTML(aviso.titulo)}</span>
              <span class="mt-1 block text-[10px] leading-relaxed text-slate-500">${escaparHTML(aviso.texto)}</span>
            </span>
            ${aviso.lida ? '' : '<span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-senai-orange" aria-label="Não lido"></span>'}
          </button>
        </article>
      `;
    }).join('');
  }

  const naoLidos = contarNaoLidos();
  texto('noticesFooter', naoLidos === 0
    ? 'Todos os avisos foram lidos'
    : `${naoLidos} ${naoLidos === 1 ? 'aviso não lido' : 'avisos não lidos'}`);

  const contador = $('#noticesCount');
  if (contador) {
    contador.textContent = naoLidos;
    contador.classList.toggle('hidden', naoLidos === 0);
  }
}

function atualizarSino() {
  const naoLidos = contarNaoLidos();
  const sino = $('#bellDot');
  const pontoNav = $('#navNoticeDot');

  if (sino) sino.hidden = naoLidos === 0;
  if (pontoNav) pontoNav.hidden = naoLidos === 0;
}

/* ---------------------------- Perfil ------------------------------------- */

function renderizarPerfil() {
  const aluno = estado.dados.aluno;

  if (aluno) {
    texto('perfilNome', aluno.nomeCompleto || aluno.nome);
    texto('perfilCurso', aluno.curso);
    texto('perfilMatricula', aluno.matricula);
    texto('perfilUnidade', aluno.unidade);
    texto('perfilIniciais', aluno.iniciais);
  }

  const backend = $('#backendStatus');
  if (backend) {
    backend.className = estado.backendConectado
      ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700'
      : 'inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700';
    backend.innerHTML = estado.backendConectado
      ? '<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> API conectada'
      : '<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Sem conexão';
  }
}

function renderizarTudo() {
  atualizarCabecalho();
  renderizarHome();
  renderizarTrilhaDeDias();
  renderizarAgendaDia(estado.diaSelecionado);
  renderizarAvisos();
  renderizarPerfil();
  atualizarSino();
}

/* ==========================================================================
   4. NAVEGAÇÃO ENTRE TELAS
   ========================================================================== */

function navegar(para, opcoes = {}) {
  const { atualizarHash = true, rolar = true } = opcoes;
  const destino = TELAS.includes(para) ? para : 'inicio';

  if (estado.aulaAbertaId) fecharDetalhes({ restaurarFoco: false });

  $$('.view').forEach((view) => {
    view.classList.toggle('is-active', view.dataset.view === destino);
  });

  $$('[data-view-target]').forEach((botao) => {
    if (!botao.classList.contains('nav-btn')) return;
    const ativo = botao.dataset.viewTarget === destino;
    botao.classList.toggle('is-active', ativo);
    if (ativo) botao.setAttribute('aria-current', 'page');
    else botao.removeAttribute('aria-current');
  });

  if (destino === 'agenda') renderizarAgendaDia(estado.diaSelecionado);
  if (destino === 'avisos') renderizarAvisos();

  document.title = `${TITULOS_TELA[destino]} · Gestor SENAI`;

  if (rolar) window.scrollTo({ top: 0, behavior: 'auto' });

  if (atualizarHash && location.hash !== `#${destino}`) {
    history.pushState({ tela: destino }, '', `#${destino}`);
  }
}

function configurarNavegacao() {
  document.addEventListener('click', (evento) => {
    const gatilho = evento.target.closest('[data-view-target]');
    if (gatilho) {
      navegar(gatilho.dataset.viewTarget);
      return;
    }

    const dia = evento.target.closest('[data-dia-index]');
    if (dia) {
      renderizarAgendaDia(Number(dia.dataset.diaIndex));
      return;
    }

    const aula = evento.target.closest('[data-aula-id]');
    if (aula) {
      abrirDetalhes(aula.dataset.aulaId);
      return;
    }

    const aviso = evento.target.closest('[data-aviso-id]');
    if (aviso) {
      const item = estado.dados.avisos.find((registro) => registro.id === aviso.dataset.avisoId);
      if (item) {
        if (!item.lida) {
          window.GestorAPI
            .requisitar(`/aluno/avisos/${encodeURIComponent(item.id)}/ler`, { metodo: 'POST' })
            .catch((erro) => {
              console.warn('[Gestor SENAI] Não foi possível marcar o aviso como lido.', erro);
            });
        }
        item.lida = true;
        renderizarAvisos();
        atualizarSino();
        if (item.aulaId) abrirDetalhes(item.aulaId);
      }
      return;
    }

    const acao = evento.target.closest('[data-acao]');
    if (acao?.dataset.acao === 'ativar-notificacoes') {
      pedirPermissaoNotificacao();
    }
  });

  window.addEventListener('popstate', () => {
    const destino = window.location.hash.replace('#', '') || 'inicio';
    navegar(destino, { atualizarHash: false });
  });

  window.addEventListener('hashchange', () => {
    const destino = window.location.hash.replace('#', '') || 'inicio';
    const atual = $('.view.is-active')?.dataset.view;
    if (destino !== atual) navegar(destino, { atualizarHash: false });
  });
}

/* ==========================================================================
   5. ALERTAS, TOAST E DETALHES DA AULA
   ========================================================================== */

function mostrarToast(titulo, mensagem, icone = 'ph-bell-ringing') {
  const toast = $('#toast');
  if (!toast) return;

  texto('toastTitle', titulo);
  texto('toastText', mensagem);

  const iconeEl = $('#toastIcon');
  if (iconeEl) iconeEl.className = `ph-fill ${icone} text-[18px]`;

  const barra = $('#toastBar');
  if (barra) {
    barra.style.animation = 'none';
    void barra.offsetWidth;
    barra.style.animation = '';
  }

  clearTimeout(estado.toastTimer);
  toast.inert = false;
  toast.classList.remove('is-visible');
  void toast.offsetWidth;
  toast.classList.add('is-visible');

  estado.toastTimer = setTimeout(esconderToast, 6200);
}

function esconderToast() {
  const toast = $('#toast');
  if (!toast) return;
  clearTimeout(estado.toastTimer);
  toast.classList.remove('is-visible');
  toast.inert = true;
}

function configurarAlerta() {
  const alerta = estado.dados.alerta;

  $('#dismissAlert')?.addEventListener('click', () => {
    const faixa = $('#alertBand');
    if (!faixa) return;

    faixa.classList.add('alert-dismissing');

    try {
      if (alerta) sessionStorage.setItem(CHAVE_ALERTA, String(alerta.id));
    } catch (erro) {
      /* armazenamento indisponível: o aviso volta na próxima visita */
    }

    setTimeout(() => {
      faixa.hidden = true;
      faixa.classList.remove('alert-dismissing');
    }, 280);
  });

  $('#alertDetalhes')?.addEventListener('click', () => {
    const id = estado.dados.alerta?.aulaId;
    if (id) abrirDetalhes(id);
  });

  $('#bellBtn')?.addEventListener('click', () => {
    const naoLidos = contarNaoLidos();
    navegar('avisos');
    mostrarToast(
      naoLidos ? 'Você tem novos avisos' : 'Tudo em dia',
      naoLidos
        ? `${naoLidos} ${naoLidos === 1 ? 'aviso aguarda' : 'avisos aguardam'} sua leitura.`
        : 'Nenhum aviso pendente no momento.',
      naoLidos ? 'ph-bell-ringing' : 'ph-check-circle'
    );
  });

  $('#closeToast')?.addEventListener('click', esconderToast);

  $('#nextClassCard')?.addEventListener('click', () => {
    const proxima = obterProximaAula();
    if (proxima) abrirDetalhes(proxima.id);
  });

  $('#btnHoje')?.addEventListener('click', () => renderizarAgendaDia(0));

  $('#markAllRead')?.addEventListener('click', async () => {
    try {
      await window.GestorAPI.requisitar('/aluno/avisos/ler-todos', { metodo: 'POST' });
      estado.dados.avisos.forEach((aviso) => { aviso.lida = true; });
      renderizarAvisos();
      atualizarSino();
      mostrarToast('Avisos lidos', 'Todos os comunicados foram marcados como lidos.', 'ph-check-circle');
    } catch (erro) {
      if (erro instanceof window.GestorAPI.ErroSessao) return;
      mostrarToast(
        'Não foi possível atualizar',
        window.GestorAPI.mensagemDeErro(erro),
        'ph-warning-circle'
      );
    }
  });
}

function preencherDetalhes(aula) {
  texto('sheetTitle', aula.titulo);
  texto('sheetSubtitle', aula.subtitulo);
  texto('sheetTime', `${aula.inicio} — ${aula.fim} · ${aula.duracao}`);
  texto('sheetRoom', aula.sala);
  texto('sheetTeacherName', aula.instrutor);
  texto('sheetTeacherInitials', aula.iniciais);
  texto('sheetTeacherRole', aula.tipo === 'prática' ? 'Instrutor(a) · aula prática' : 'Instrutor(a) · aula teórica');
  texto('sheetDirections', aula.direcoes);

  const avisoSala = $('#sheetRoomWarning');
  if (avisoSala) {
    avisoSala.hidden = !aula.alterada;
    if (aula.alterada) {
      texto('sheetOldRoom', aula.salaAnterior || 'sala anterior');
      texto('sheetNewRoom', aula.sala);
    }
  }
}

function abrirDetalhes(aulaId) {
  const aula = encontrarAula(aulaId);
  const overlay = $('#sheetOverlay');
  if (!aula || !overlay) return;

  estado.aulaAbertaId = aula.id;
  estado.ultimoFoco = document.activeElement;

  preencherDetalhes(aula);

  overlay.inert = false;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('is-open');
  document.body.classList.add('sheet-open');

  setTimeout(() => {
    overlay.querySelector('[data-close-sheet]')?.focus();
  }, 60);
}

function fecharDetalhes({ restaurarFoco = true } = {}) {
  const overlay = $('#sheetOverlay');
  if (!overlay) return;

  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');

  setTimeout(() => {
    if (!overlay.classList.contains('is-open')) overlay.inert = true;
  }, 450);

  estado.aulaAbertaId = null;

  if (restaurarFoco && estado.ultimoFoco instanceof HTMLElement) {
    estado.ultimoFoco.focus?.();
  }
}

function configurarDetalhes() {
  $$('[data-close-sheet]').forEach((elemento) => {
    elemento.addEventListener('click', () => fecharDetalhes());
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && estado.aulaAbertaId) fecharDetalhes();
  });

  $('#addToCalendar')?.addEventListener('click', () => {
    const aula = encontrarAula(estado.aulaAbertaId || estado.dados.proximaAulaId);
    if (!aula) return;

    try {
      baixarICS(aula);
      mostrarToast('Aula salva', `${aula.titulo} foi enviada para o seu calendário.`, 'ph-calendar-check');
      fecharDetalhes();
    } catch (erro) {
      console.error('[Gestor SENAI] Não foi possível gerar o arquivo .ics', erro);
      mostrarToast('Não foi possível salvar', 'Tente novamente em instantes.', 'ph-warning-circle');
    }
  });
}

/**
 * Gera um arquivo .ics local — não depende de back-end.
 * Quando a API existir, o evento pode ser criado direto na conta do aluno.
 */
function baixarICS(aula) {
  const agora = new Date();
  const [horaInicio, minutoInicio] = aula.inicio.split(':').map(Number);
  const [horaFim, minutoFim] = aula.fim.split(':').map(Number);

  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), horaInicio, minutoInicio, 0);
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), horaFim, minutoFim, 0);

  const doisDigitos = (valor) => String(valor).padStart(2, '0');
  const paraICS = (data) => `${data.getFullYear()}${doisDigitos(data.getMonth() + 1)}${doisDigitos(data.getDate())}T${doisDigitos(data.getHours())}${doisDigitos(data.getMinutes())}00`;
  const escapar = (valor) => String(valor).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gestor SENAI//Agenda do aluno//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapar(aula.id)}@gestorsenai`,
    `DTSTAMP:${paraICS(agora)}`,
    `DTSTART:${paraICS(inicio)}`,
    `DTEND:${paraICS(fim)}`,
    `SUMMARY:${escapar(aula.titulo)}`,
    `LOCATION:${escapar(`${aula.sala} — SENAI`)}`,
    `DESCRIPTION:${escapar(`${aula.subtitulo} · Instrutor(a): ${aula.instrutor}`)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const blob = new Blob([linhas.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `gestor-senai-${aula.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ==========================================================================
   6. NOTIFICAÇÕES (Notification API)
   ========================================================================== */

function urlDeAsset(caminho) {
  return new URL(caminho, window.location.href).href;
}

function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function estaInstalado() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}

/**
 * Atualiza o cartão de notificações do perfil conforme a permissão atual.
 */
function atualizarUIDeNotificacoes() {
  const status = $('#notificationStatus');
  const botao = $('#btnAtivarNotificacoes');
  const label = $('#btnAtivarLabel');
  const ajuda = $('#notificationHelp');
  const teste = $('#btnTestNotification');

  if (!status || !botao || !label || !ajuda) return;

  const classesBase = 'rounded-full px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[.1em]';
  const suportado = 'Notification' in window;
  const permissao = suportado ? Notification.permission : 'unsupported';

  if (permissao === 'granted') {
    status.className = `${classesBase} bg-emerald-50 text-emerald-700`;
    status.textContent = 'Ativadas';
    botao.disabled = true;
    label.textContent = 'Notificações ativadas';
    ajuda.textContent = 'Tudo certo! Você receberá avisos de mudança de sala e comunicados da coordenação.';
    if (teste) teste.hidden = false;
    return;
  }

  if (permissao === 'denied') {
    status.className = `${classesBase} bg-rose-50 text-rose-600`;
    status.textContent = 'Bloqueadas';
    botao.disabled = false;
    label.textContent = 'Como liberar a permissão';
    ajuda.textContent = 'As notificações estão bloqueadas nos ajustes deste navegador/aparelho. Libere em Configurações → Notificações → Gestor SENAI.';
    if (teste) teste.hidden = true;
    return;
  }

  if (permissao === 'unsupported') {
    status.className = `${classesBase} bg-slate-100 text-slate-600`;
    status.textContent = 'Indisponível';
    botao.disabled = true;
    label.textContent = 'Notificações indisponíveis';
    ajuda.textContent = 'Este navegador não oferece a API de notificações. Instale o app na tela de início para usar os recursos do PWA.';
    if (teste) teste.hidden = true;
    return;
  }

  status.className = `${classesBase} bg-slate-100 text-slate-600`;
  status.textContent = 'Desativadas';
  botao.disabled = false;
  label.textContent = 'Ativar notificações';

  if (ehIOS() && !estaInstalado()) {
    ajuda.textContent = 'No iPhone, instale o app na Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por ele para ativar as notificações.';
  } else {
    ajuda.textContent = 'Autorize o Gestor SENAI a enviar avisos. Você pode desativar quando quiser nos ajustes do aparelho.';
  }

  if (teste) teste.hidden = true;
}

/**
 * Função pública exigida pela integração: abre o pedido nativo de permissão.
 * Deve ser chamada a partir de um clique (gesto do usuário).
 */
async function pedirPermissaoNotificacao() {
  if (!('Notification' in window)) {
    mostrarToast(
      'Notificações indisponíveis',
      'Este navegador não oferece a API de notificações. Instale o app na tela de início.',
      'ph-warning-circle'
    );
    return 'unsupported';
  }

  if (Notification.permission === 'granted') {
    atualizarUIDeNotificacoes();
    mostrarToast('Notificações já ativadas', 'Você está recebendo os avisos da coordenação.', 'ph-check-circle');
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    atualizarUIDeNotificacoes();
    mostrarToast(
      'Permissão bloqueada',
      'Libere as notificações nos ajustes do navegador/aparelho para o Gestor SENAI.',
      'ph-prohibit'
    );
    return 'denied';
  }

  let permissao;

  try {
    permissao = await Notification.requestPermission();
  } catch (erro) {
    console.error('[Gestor SENAI] Falha ao pedir permissão de notificação', erro);
    mostrarToast('Não foi possível ativar', 'Tente novamente pelo app instalado.', 'ph-warning-circle');
    return 'error';
  }

  atualizarUIDeNotificacoes();

  if (permissao === 'granted') {
    mostrarToast(
      'Notificações ativadas',
      'Você será avisado sobre mudanças de sala e avisos da coordenação.',
      'ph-bell-ringing'
    );
    await mostrarNotificacaoDeTeste(true);
    registrarPushNoServidor();
  } else if (permissao === 'denied') {
    mostrarToast(
      'Permissão não concedida',
      'Você pode ativar depois em Configurações → Notificações → Gestor SENAI.',
      'ph-bell-slash'
    );
  }

  return permissao;
}

async function mostrarNotificacaoDeTeste(boasVindas = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const opcoes = {
    body: boasVindas
      ? 'Avisos de mudança de sala e comunicados da coordenação chegarão por aqui.'
      : 'Esta é uma notificação de teste do Gestor SENAI.',
    icon: urlDeAsset('assets/icon-192.png'),
    badge: urlDeAsset('assets/icon-192.png'),
    tag: 'gestor-senai-teste',
    renotify: true,
    data: { url: new URL('./index.html#avisos', window.location.href).href }
  };

  try {
    const registro = await navigator.serviceWorker.ready;
    await registro.showNotification(boasVindas ? 'Notificações ativadas' : 'Gestor SENAI · teste', opcoes);
  } catch (erro) {
    console.warn('[Gestor SENAI] Service Worker indisponível para notificar; usando Notification direta.', erro);
    try {
      new Notification('Gestor SENAI', opcoes);
    } catch (erroDireto) {
      console.error('[Gestor SENAI] Notificação não suportada neste contexto.', erroDireto);
    }
  }
}

/* --------------------------------------------------------------------------
   Web Push (VAPID)
   -------------------------------------------------------------------------- */

function chaveParaUint8Array(base64) {
  const preenchimento = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(normalizada);
  return Uint8Array.from(Array.from(bruto, (caractere) => caractere.charCodeAt(0)));
}

/**
 * Garante a inscrição do navegador no Web Push e envia a assinatura à API.
 * Silencioso por padrão: sem VAPID configurado, apenas registra um aviso.
 */
async function registrarPushNoServidor() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const registro = await navigator.serviceWorker.ready;
    let inscricao = await registro.pushManager.getSubscription();

    if (!inscricao) {
      const { publicKey } = await window.GestorAPI.requisitar('/push/chave-publica', {
        redirecionar: false
      });
      if (!publicKey) return;

      inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaUint8Array(publicKey)
      });
    }

    await window.GestorAPI.requisitar('/push/inscrever', {
      metodo: 'POST',
      corpo: inscricao.toJSON(),
      redirecionar: false
    });

    console.info('[Gestor SENAI] Web Push registrado para este aparelho.');
  } catch (erro) {
    console.warn('[Gestor SENAI] Não foi possível registrar o Web Push.', erro);
  }
}

function configurarNotificacoes() {
  $('#btnAtivarNotificacoes')?.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'denied') {
      mostrarToast(
        'Permissão bloqueada',
        'Abra os ajustes do navegador/aparelho e permita notificações para o Gestor SENAI.',
        'ph-prohibit'
      );
      return;
    }
    pedirPermissaoNotificacao();
  });

  $('#btnTestNotification')?.addEventListener('click', () => mostrarNotificacaoDeTeste(false));
}

/* ==========================================================================
   7. INSTALAÇÃO DO PWA
   ========================================================================== */

function atualizarUIInstalacao() {
  const status = $('#installStatus');
  const botao = $('#btnInstalarApp');
  const label = $('#btnInstalarLabel');
  const ajuda = $('#installHelp');
  if (!status || !botao || !label || !ajuda) return;

  const classesBase = 'rounded-full px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[.1em]';

  if (estaInstalado()) {
    status.className = `${classesBase} bg-emerald-50 text-emerald-700`;
    status.textContent = 'Instalado';
    botao.disabled = true;
    label.textContent = 'Aplicativo instalado';
    ajuda.textContent = 'Você já está usando o Gestor SENAI como aplicativo. As notificações funcionam melhor neste modo.';
    return;
  }

  if (estado.promptInstalacao) {
    status.className = `${classesBase} bg-senai-dark/5 text-senai-dark`;
    status.textContent = 'Pronto';
    botao.disabled = false;
    label.textContent = 'Instalar aplicativo';
    ajuda.textContent = 'Adicione o Gestor SENAI à tela de início para abrir em tela cheia, sem a barra do navegador.';
    return;
  }

  status.className = `${classesBase} bg-slate-100 text-slate-600`;
  status.textContent = ehIOS() ? 'iOS' : 'Navegador';
  botao.disabled = false;
  label.textContent = 'Como instalar';
  ajuda.textContent = ehIOS()
    ? 'No Safari, toque em Compartilhar → Adicionar à Tela de Início.'
    : 'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.';
}

async function instalarAplicativo() {
  if (estado.promptInstalacao) {
    estado.promptInstalacao.prompt();
    const { outcome } = await estado.promptInstalacao.userChoice;
    estado.promptInstalacao = null;
    atualizarUIInstalacao();

    if (outcome === 'accepted') {
      mostrarToast('Instalando o app', 'O Gestor SENAI será adicionado à sua tela de início.', 'ph-device-mobile');
    } else {
      mostrarToast('Instalação cancelada', 'Você pode instalar depois pelo perfil do aluno.', 'ph-info');
    }
    return;
  }

  mostrarToast(
    'Instalar o Gestor SENAI',
    ehIOS()
      ? 'No Safari: toque em Compartilhar → Adicionar à Tela de Início.'
      : 'No menu do navegador, escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.',
    'ph-device-mobile'
  );
}

function configurarInstalacao() {
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    estado.promptInstalacao = evento;
    atualizarUIInstalacao();
  });

  window.addEventListener('appinstalled', () => {
    estado.promptInstalacao = null;
    atualizarUIInstalacao();
    mostrarToast('App instalado', 'O Gestor SENAI já está na sua tela de início.', 'ph-check-circle');
  });

  $('#btnInstalarApp')?.addEventListener('click', instalarAplicativo);
}

/* ==========================================================================
   8. SERVICE WORKER, TEMPO REAL E DIAGNÓSTICO
   ========================================================================== */

function atualizarStatusServiceWorker(situacao) {
  const status = $('#swStatus');
  if (!status) return;

  const classesBase = 'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold';

  const mapa = {
    ativo: {
      classes: 'bg-emerald-50 text-emerald-700',
      ponto: 'bg-emerald-500',
      rotulo: 'Ativo'
    },
    local: {
      classes: 'bg-amber-50 text-amber-700',
      ponto: 'bg-amber-500',
      rotulo: 'Requer http'
    },
    erro: {
      classes: 'bg-rose-50 text-rose-600',
      ponto: 'bg-rose-500',
      rotulo: 'Erro'
    },
    indisponivel: {
      classes: 'bg-slate-100 text-slate-600',
      ponto: 'bg-slate-400',
      rotulo: 'Indisponível'
    }
  };

  const configuracao = mapa[situacao] || mapa.indisponivel;
  status.className = `${classesBase} ${configuracao.classes}`;
  status.innerHTML = `<span class="h-1.5 w-1.5 rounded-full ${configuracao.ponto}"></span>${configuracao.rotulo}`;
}

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    atualizarStatusServiceWorker('indisponivel');
    return;
  }

  if (window.location.protocol === 'file:') {
    atualizarStatusServiceWorker('local');
    console.warn(
      '[Gestor SENAI] O Service Worker só funciona em http://localhost ou https://.\n' +
      'Abra o projeto com um servidor local (ex.: python -m http.server) para testar o modo offline e a instalação.'
    );
    return;
  }

  const swURL = new URL('./sw.js', window.location.href);

  try {
    const registro = await navigator.serviceWorker.register(swURL.href, { scope: './' });
    console.info('[Gestor SENAI] Service Worker registrado. Escopo:', registro.scope, '| Arquivo:', swURL.href);
    atualizarStatusServiceWorker('ativo');

    registro.addEventListener('updatefound', () => {
      const novo = registro.installing;
      novo?.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          console.info('[Gestor SENAI] Nova versão disponível. Recarregue para atualizar.');
        }
      });
    });
  } catch (erro) {
    console.error('[Gestor SENAI] Falha ao registrar o Service Worker', erro);
    atualizarStatusServiceWorker('erro');
  }
}

/**
 * Diagnóstico da identidade visual: mostra no console o caminho absoluto de
 * cada arte oficial usada na página, para conferir se é o arquivo correto.
 */
function registrarDiagnosticoDeMarca() {
  $$('img[data-brand]').forEach((imagem) => {
    const relatar = () => {
      const caminho = imagem.currentSrc || imagem.src;
      const carregada = imagem.complete && imagem.naturalWidth > 0;
      const detalhe = carregada
        ? `${imagem.naturalWidth}×${imagem.naturalHeight}px`
        : 'não carregou — confira o caminho';
      const metodo = carregada ? 'info' : 'error';
      console[metodo](`[Gestor SENAI] Marca "${imagem.dataset.brand}" → ${caminho} (${detalhe})`);
    };

    if (imagem.complete) {
      relatar();
    } else {
      imagem.addEventListener('load', relatar, { once: true });
      imagem.addEventListener('error', relatar, { once: true });
    }
  });

  console.info('[Gestor SENAI] Manifest:', new URL('manifest.webmanifest', window.location.href).href);
  console.info('[Gestor SENAI] Service Worker:', new URL('sw.js', window.location.href).href);
  console.info(`[Gestor SENAI] Versão ${CONFIG.VERSAO} · ${CONFIG.API_BASE_URL ? 'API conectada' : 'modo demonstração'}`);
}

/**
 * Tempo real via SSE.
 * O EventSource nativo do navegador não permite cabeçalhos customizados, o que
 * impedia o bypass do túnel (X-Tunnels-Skip-AntiPhishing-Page). Por isso o canal
 * SSE é aberto com fetch (que aceita headers) + ReadableStream, garantindo que o
 * header de bypass seja enviado. O token vai na query string.
 * Cada mudança/aviso também recarregar a agenda para refletir tudo na tela.
 */
async function iniciarTempoReal() {
  const valorToken = window.GestorAPI.token();
  if (!valorToken) return;

  const url = `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.eventos}?token=${encodeURIComponent(valorToken)}`;
  const cabecalhos = {
    Accept: 'text/event-stream',
    ...window.GestorAPI.CABECALHOS_TUNNEL
  };

  const recarregar = () => {
    window.GestorSENAI?.recarregarDados?.().catch((erro) => {
      console.warn('[Gestor SENAI] Falha ao sincronizar após evento.', erro);
    });
  };

  const notificar = (nomeEvento, dados) => {
    if (nomeEvento === 'mudanca-sala') {
      mostrarToast('Mudança de sala', dados.mensagem || 'Uma aula mudou de sala.', 'ph-door-open');
    }

    if (nomeEvento === 'aviso') {
      mostrarToast('Novo aviso', dados.mensagem || 'A coordenação publicou um aviso.', 'ph-bell-ringing');
    }

    recarregar();
  };

  try {
    const resposta = await fetch(url, {
      method: 'GET',
      headers: cabecalhos,
      credentials: 'include',
      cache: 'no-store'
    });

    if (!resposta.ok || !resposta.body) {
      console.warn('[Gestor SENAI] Canal SSE indisponível. Status:', resposta && resposta.status);
      return;
    }

    const reader = resposta.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const processarBloco = (bloco) => {
      const linhas = bloco.split('\n');
      const nomeEvento = (linhas[0] || '').replace(/^event:/i, '').trim();
      const data = linhas
        .filter((linha) => linha.startsWith('data:'))
        .map((linha) => linha.replace(/^data:/i, ''))
        .join('\n');

      if (!nomeEvento || !data) return;

      let dados;
      try {
        dados = JSON.parse(data);
      } catch (erro) {
        console.warn('[Gestor SENAI] Evento de tempo real inválido', erro);
        return;
      }

      notificar(nomeEvento, dados);
    };

    const processarBuffer = () => {
      const indiceUltimo = buffer.lastIndexOf('\n\n');
      if (indiceUltimo === -1) return;
      const blocos = buffer.slice(0, indiceUltimo).split('\n\n');
      buffer = buffer.slice(indiceUltimo + 2);
      blocos.forEach(processarBloco);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processarBuffer();
    }

    buffer += decoder.decode();
    processarBuffer();
  } catch (erro) {
    console.warn('[Gestor SENAI] Não foi possível abrir o canal de tempo real.', erro);
  }
}

/**
 * Busca a agenda do aluno autenticado.
 * 401/403 → js/sessao.js limpa a sessão e redireciona para login.html.
 * Falhas de rede são propagadas para a tela de erro do app.
 */
async function carregarDadosDoAluno() {
  const dados = await window.GestorAPI.requisitar(CONFIG.ENDPOINTS.agenda);

  estado.backendConectado = true;
  document.documentElement.dataset.backend = 'api';
  console.info('[Gestor SENAI] Agenda recebida de', CONFIG.API_BASE_URL);
  return normalizarDados(dados);
}

/* ==========================================================================
   9. INICIALIZAÇÃO
   ========================================================================== */

function esconderOverlay() {
  const overlay = $('#apiOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

function mostrarErroDeConexao(erro) {
  const overlay = $('#apiOverlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  $('#apiOverlaySpinner')?.classList.add('hidden');
  texto('apiOverlayTitle', 'Não foi possível carregar sua agenda');
  texto('apiOverlayText', window.GestorAPI.mensagemDeErro(erro));

  const tentar = $('#apiRetry');
  const irLogin = $('#apiIrLogin');
  if (tentar) tentar.hidden = false;
  if (irLogin) irLogin.hidden = false;
}

function configurarOverlay() {
  $('#apiRetry')?.addEventListener('click', () => window.location.reload());
  $('#apiIrLogin')?.addEventListener('click', () => window.GestorAPI.irParaLogin());
}

function configurarSessao() {
  const sair = () => window.GestorAPI.sair();
  $('#btnSair')?.addEventListener('click', sair);
  $('#btnSairPerfil')?.addEventListener('click', sair);
}

/**
 * Confirma a sessão e o papel antes de montar a tela.
 * Coordenação vai para o painel; conta desconhecida volta ao login.
 */
async function garantirSessaoDeAluno() {
  const dados = await window.GestorAPI.requisitar('/auth/me');
  const papel = dados?.usuario?.papel;

  if (papel === 'coordenacao') {
    window.location.replace('dashboard.html');
    return false;
  }

  if (papel !== 'aluno') {
    window.GestorAPI.limparSessao();
    window.GestorAPI.irParaLogin('permissao');
    return false;
  }

  window.GestorAPI.salvarSessao(window.GestorAPI.token(), dados.usuario);
  return true;
}

async function iniciarApp() {
  configurarOverlay();
  configurarSessao();

  try {
    if (!(await garantirSessaoDeAluno())) return;

    estado.dados = await carregarDadosDoAluno();
    renderizarTudo();
    esconderOverlay();
  } catch (erro) {
    if (erro instanceof window.GestorAPI.ErroSessao) return;
    console.error('[Gestor SENAI] Falha ao carregar a agenda', erro);
    mostrarErroDeConexao(erro);
    return;
  }

  /* Tela inicial conforme o hash (#agenda, #avisos, #perfil) */
  const telaInicial = window.location.hash.replace('#', '');
  navegar(TELAS.includes(telaInicial) ? telaInicial : 'inicio', {
    atualizarHash: false,
    rolar: false
  });

  configurarNavegacao();
  configurarAlerta();
  configurarDetalhes();
  configurarNotificacoes();
  configurarInstalacao();

  atualizarUIDeNotificacoes();
  atualizarUIInstalacao();
  registrarServiceWorker();
  registrarDiagnosticoDeMarca();
  iniciarTempoReal();
  registrarPushNoServidor();
}

/* Expõe a função exigida e um pequeno objeto de depuração. */
window.pedirPermissaoNotificacao = pedirPermissaoNotificacao;
window.GestorSENAI = Object.freeze({
  versao: CONFIG.VERSAO,
  pedirPermissaoNotificacao,
  recarregarDados: async () => {
    estado.dados = await carregarDadosDoAluno();
    renderizarTudo();
  }
});

/* O script é carregado com defer: o DOM já está pronto. */
iniciarApp().catch((erro) => {
  console.error('[Gestor SENAI] Erro na inicialização do app', erro);
});
