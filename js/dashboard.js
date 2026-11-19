/* ==========================================================================
   Gestor SENAI - integração do painel da coordenação
   --------------------------------------------------------------------------
   Consome a API (resumo, conflitos, avisos, alocações) e protege a tela.
   Depende de js/sessao.js.
   ========================================================================== */

(function () {
  'use strict';

  const API = window.GestorAPI;
  if (!API) {
    console.error('[Gestor SENAI] js/sessao.js não foi carregado.');
    return;
  }

  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const CORES_AVISO = {
    sala: 'bg-senai-orange',
    material: 'bg-sky-500',
    evento: 'bg-emerald-500',
    cancelamento: 'bg-rose-500',
    sistema: 'bg-slate-300'
  };

  const ICONES_AVISO = {
    sala: 'ph-door',
    material: 'ph-package',
    evento: 'ph-calendar-star',
    cancelamento: 'ph-x-circle',
    sistema: 'ph-info'
  };

  const FUNDOS_AVISO = {
    sala: 'bg-senai-orange/10 text-senai-orange',
    material: 'bg-sky-50 text-sky-600',
    evento: 'bg-emerald-50 text-emerald-600',
    cancelamento: 'bg-rose-50 text-rose-600',
    sistema: 'bg-slate-100 text-slate-500'
  };

  // Usados no sino enquanto a API ainda não retorna avisos.
  const AVISOS_DEMONSTRACAO = [
    {
      tipo: 'sala',
      titulo: 'Lab 03 liberado mais cedo',
      texto: 'A manutenção preventiva terminou antes do previsto. O laboratório está livre a partir das 14:00.',
      destinatario: 'Coordenação',
      quando: new Date(Date.now() - 35 * 60000).toISOString(),
      exemplo: true
    },
    {
      tipo: 'evento',
      titulo: 'Semana de Inovação SENAI',
      texto: 'Inscrições para as turmas da tarde abertas até sexta-feira, no portal do aluno.',
      destinatario: 'Todos os alunos',
      quando: new Date(Date.now() - 3 * 3600000).toISOString(),
      exemplo: true
    }
  ];

  const porId = (id) => document.getElementById(id);
  const selecionar = (seletor) => document.querySelector(seletor);

  const HORARIOS_GRADE = ['08:00', '10:00', '14:00', '16:00'];
  const DIAS_UTEIS = [
    { chave: 'seg', nome: 'Seg' },
    { chave: 'ter', nome: 'Ter' },
    { chave: 'qua', nome: 'Qua' },
    { chave: 'qui', nome: 'Qui' },
    { chave: 'sex', nome: 'Sex' }
  ];

  let semanaInicio = segundaDaSemana(new Date());
  let aulasSemana = [];
  let salasCache = [];

  function segundaDaSemana(data) {
    const d = new Date(data);
    const dia = d.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isoData(data) {
    return new Date(data).toISOString().slice(0, 10);
  }

  function adicionarDias(data, dias) {
    const d = new Date(data);
    d.setDate(d.getDate() + dias);
    return d;
  }

  function diaSemanaDeData(iso) {
    const mapa = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const d = new Date(`${iso}T12:00:00`);
    return mapa[d.getDay()];
  }

  function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caractere) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[caractere]));
  }

  function normalizar(valor) {
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function tempoRelativo(valor) {
    if (!valor) return '';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);

    const minutos = Math.floor((Date.now() - data.getTime()) / 60000);
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas} h`;
    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'ontem';
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function dataCurta(iso) {
    const data = new Date(`${iso}T12:00:00`);
    return Number.isNaN(data.getTime()) ? iso : `${data.getDate()} ${MESES_CURTOS[data.getMonth()]}`;
  }

  function nomeDoDia(iso) {
    const data = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(data.getTime())) return '';
    const nome = DIAS_CURTOS[data.getDay()];
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  function formatarPeriodo(inicio, fim) {
    const de = new Date(`${inicio}T12:00:00`);
    const ate = new Date(`${fim}T12:00:00`);
    if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return `${inicio} - ${fim}`;

    if (de.getMonth() === ate.getMonth()) {
      return `${de.getDate()} - ${ate.getDate()} de ${MESES_CURTOS[de.getMonth()]} de ${ate.getFullYear()}`;
    }

    return `${de.getDate()} de ${MESES_CURTOS[de.getMonth()]} - ${ate.getDate()} de ${MESES_CURTOS[ate.getMonth()]} de ${ate.getFullYear()}`;
  }

  function numeroDaSemana(data = new Date()) {
    const alvo = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
    const dia = alvo.getUTCDay() || 7;
    alvo.setUTCDate(alvo.getUTCDate() + 4 - dia);
    const inicioAno = new Date(Date.UTC(alvo.getUTCFullYear(), 0, 1));
    return Math.ceil((((alvo - inicioAno) / 86400000) + 1) / 7);
  }

  function horaAgora() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function avisar(tipo, titulo, texto) {
    if (typeof window.showToast === 'function') {
      window.showToast(tipo, titulo, texto);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cabeçalho, menu e rodapé                                            */
  /* ------------------------------------------------------------------ */

  function pintarUsuario(usuario) {
    const nome = usuario?.nome || 'Coordenação';
    const iniciais = usuario?.iniciais || 'CP';

    if (porId('headerUserName')) porId('headerUserName').textContent = nome;
    if (porId('headerInitials')) porId('headerInitials').textContent = iniciais;
    if (porId('profileMenuName')) porId('profileMenuName').textContent = nome;
    if (porId('sidebarName')) porId('sidebarName').textContent = nome;
    if (porId('sidebarInitials')) porId('sidebarInitials').textContent = iniciais;
  }

  function pintarConexao(ok, mensagem) {
    const rotulo = porId('apiModeLabel');
    const detalhe = porId('apiModeText');
    const rodape = porId('footerStatus');

    if (rotulo) {
      rotulo.textContent = ok ? 'API conectada' : 'API indisponível';
      rotulo.className = ok
        ? 'text-[8.5px] font-medium uppercase tracking-[.14em] text-emerald-300/80'
        : 'text-[8.5px] font-medium uppercase tracking-[.14em] text-rose-300/80';
    }

    if (detalhe) {
      detalhe.textContent = ok
        ? 'Métricas e avisos sincronizados com o back-end.'
        : 'Não foi possível sincronizar agora. Tentaremos novamente em instantes.';
    }

    if (rodape) {
      rodape.textContent = ok
        ? `Conectado à API · atualizado às ${horaAgora()}`
        : `Sem conexão com a API${mensagem ? ` · ${mensagem}` : ''}`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Métricas                                                            */
  /* ------------------------------------------------------------------ */

  function pintarResumo(resumo) {
    const pct = Math.max(0, Math.min(100, Number(resumo.ocupacaoPercent) || 0));
    const aulas = Number(resumo.aulasHoje) || 0;
    const conflitos = Number(resumo.conflitos) || 0;

    if (porId('lessonsToday')) porId('lessonsToday').textContent = aulas;
    if (porId('occupancyValue')) porId('occupancyValue').textContent = pct;
    if (porId('labsUsage')) porId('labsUsage').textContent = `${resumo.labsEmUso} labs em uso`;
    if (porId('labsTotal')) porId('labsTotal').textContent = `${resumo.totalLabs} no total`;

    const anel = porId('occupancyRing');
    if (anel) anel.setAttribute('stroke-dashoffset', String(113.1 * (1 - pct / 100)));

    const barra = porId('occupancyBar');
    if (barra) barra.style.width = `${pct}%`;

    const selo = porId('occupancyBadge');
    if (selo) {
      const alta = pct >= 90;
      selo.className = alta
        ? 'inline-flex items-center gap-1 rounded-xl bg-orange-50 px-1.5 py-0.5 text-[8.5px] font-semibold text-[#B9470F]'
        : 'inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-1.5 py-0.5 text-[8.5px] font-semibold text-emerald-700';
      selo.innerHTML = alta
        ? '<i class="ph ph-warning text-[10px]"></i> Alta ocupação'
        : '<i class="ph ph-check-circle text-[10px]"></i> Ocupação do dia';
    }

    if (porId('lessonsDetail')) {
      porId('lessonsDetail').innerHTML = `${aulas} aula${aulas === 1 ? '' : 's'}<br/>no dia`;
    }
    if (porId('lessonsTotal')) porId('lessonsTotal').textContent = `${aulas} aulas`;
    if (porId('lessonsUpdated')) porId('lessonsUpdated').textContent = `Atualizado às ${horaAgora()}`;

    if (porId('conflictsValue')) porId('conflictsValue').textContent = conflitos;

    if (porId('sidebarOccupancy')) porId('sidebarOccupancy').textContent = pct;
    if (porId('sidebarOccupancyBar')) porId('sidebarOccupancyBar').style.width = `${pct}%`;
    if (porId('sidebarLabs')) {
      porId('sidebarLabs').textContent = `${resumo.labsEmUso}/${resumo.totalLabs} labs`;
    }
    if (porId('sidebarUpdated')) {
      porId('sidebarUpdated').textContent = `Atualizado às ${horaAgora()}`;
    }
  }

  function pintarConflitos(conflitos) {
    const total = conflitos.length;
    const selo = porId('conflictBadge');
    const detalhe = porId('conflictDetail');
    const botao = porId('resolveConflictMetric');

    if (selo) {
      if (total > 0) {
        selo.className = 'inline-flex items-center gap-1.5 rounded-xl border border-senai-orange/15 bg-senai-orange/[0.08] px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[.08em] text-[#B9470F]';
        selo.innerHTML = '<span class="h-1 w-1 rounded-full bg-senai-orange"></span>Requer atenção';
      } else {
        selo.className = 'inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[.08em] text-emerald-700';
        selo.innerHTML = '<span class="h-1 w-1 rounded-full bg-emerald-500"></span>Grade consistente';
      }
    }

    if (detalhe) {
      if (!total) {
        detalhe.textContent = 'Nenhum choque de sala ou instrutor.';
      } else {
        const primeiro = conflitos[0];
        detalhe.textContent = `${nomeDoDia(primeiro.data)} · ${primeiro.inicio} · ${primeiro.recurso}`;
      }
    }

    if (botao) {
      botao.hidden = total === 0;
      botao.onclick = () => {
        if (typeof window.openConflict === 'function') window.openConflict();
      };
    }
  }

  function pintarAvisos(avisos) {
    const lista = porId('noticesList');
    const contador = porId('sidebarNoticeCount');

    if (contador) contador.textContent = avisos.length;

    if (!lista) return;

    if (!avisos.length) {
      lista.innerHTML = `
        <div class="px-1 py-6 text-center">
          <i class="ph ph-megaphone text-[22px] text-slate-300"></i>
          <p class="mt-2 text-[10px] font-medium text-senai-dark">Nenhum aviso publicado</p>
          <p class="mt-1 text-[9px] text-slate-500">Os comunicados enviados aos alunos aparecem aqui.</p>
        </div>
      `;
      return;
    }

    lista.innerHTML = avisos
      .map((aviso) => {
        const cor = CORES_AVISO[aviso.tipo] || CORES_AVISO.sistema;
        return `
          <div class="group flex w-full items-start gap-3 py-3.5">
            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${cor}"></span>
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-semibold leading-snug text-senai-dark">${escapar(aviso.titulo)}</p>
              <p class="mt-1 text-[8.5px] leading-relaxed text-slate-500">${escapar(aviso.texto)}</p>
              <p class="mt-1 text-[8px] text-slate-400">Para: ${escapar(aviso.destinatario)}</p>
            </div>
            <span class="shrink-0 text-[8px] text-slate-500">${escapar(tempoRelativo(aviso.quando))}</span>
          </div>
        `;
      })
      .join('');
  }

  function pintarNotificacoes(avisos) {
    const lista = porId('bellList');
    const subtitulo = porId('bellSubtitle');
    if (!lista) return;

    const itens = avisos?.length ? avisos.slice(0, 6) : AVISOS_DEMONSTRACAO;

    if (subtitulo) {
      subtitulo.textContent = avisos?.length
        ? `${itens.length} ${itens.length === 1 ? 'notificação recente' : 'notificações recentes'}`
        : 'Exemplos de notificação';
    }

    lista.innerHTML = itens
      .map((aviso) => {
        const tipo = aviso.tipo || 'sistema';
        const icone = ICONES_AVISO[tipo] || ICONES_AVISO.sistema;
        const fundo = FUNDOS_AVISO[tipo] || FUNDOS_AVISO.sistema;
        const meta = [escapar(aviso.destinatario || 'Coordenação'), escapar(tempoRelativo(aviso.quando))];
        if (aviso.exemplo) meta.unshift('Exemplo');

        return `
          <div class="flex gap-3 border-b border-slate-100 py-3 last:border-0">
            <span class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${fundo}">
              <i class="ph ${icone} text-[13px]"></i>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-semibold leading-snug text-senai-dark">${escapar(aviso.titulo)}</p>
              <p class="mt-0.5 text-[8.5px] leading-relaxed text-slate-500">${escapar(aviso.texto)}</p>
              <p class="mt-1 text-[8px] text-slate-400">${meta.join(' · ')}</p>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function pintarPeriodo(alocacoes) {
    if (!alocacoes) return;

    const periodo = formatarPeriodo(alocacoes.inicio, alocacoes.fim);
    const total = (alocacoes.dias || []).reduce((soma, dia) => soma + (dia.aulas?.length || 0), 0);
    const semana = numeroDaSemana();

    if (porId('periodoLabel')) porId('periodoLabel').textContent = periodo;
    if (porId('periodoGrade')) porId('periodoGrade').textContent = periodo;
    if (porId('allocationCount')) {
      porId('allocationCount').textContent = `${total} aula${total === 1 ? '' : 's'} na semana`;
    }
    if (porId('weekBadge')) porId('weekBadge').textContent = `Semana ${semana}`;
    if (porId('weekEyebrow')) porId('weekEyebrow').textContent = `Semana ${semana}`;
  }

  /* ------------------------------------------------------------------ */
  /* Calendário dinâmico                                                 */
  /* ------------------------------------------------------------------ */

  function sincronizarEstadoGlobal() {
    window.GestorDashboard = {
      semanaInicio,
      aulasSemana,
      salas: salasCache,
      atualizar
    };
  }

  async function carregarSalas() {
    try {
      salasCache = await API.requisitar('/dashboard/salas');
    } catch (erro) {
      salasCache = [];
    }
    sincronizarEstadoGlobal();
  }

  function aulasDoDiaHora(dataISO, hora) {
    const dia = aulasSemana.find((d) => d.data === dataISO);
    if (!dia) return [];
    return (dia.aulas || []).filter((aula) => aula.inicio === hora);
  }

  function renderizarGrade() {
    const head = porId('gradeHead');
    const body = porId('gradeBody');
    if (!head || !body) return;

    const inicio = semanaInicio;
    const fim = adicionarDias(inicio, 4);

    // Cabeçalho
    let headHtml = '<tr>';
    headHtml += '<th scope="col" class="sticky left-0 z-20 w-[90px] border-b border-r border-slate-100 bg-white px-4 py-3 text-left"><span class="text-[8px] font-semibold uppercase tracking-[.16em] text-slate-500">Horário</span></th>';
    for (let i = 0; i < 5; i++) {
      const d = adicionarDias(inicio, i);
      const hoje = isoData(new Date()) === isoData(d);
      const diaInfo = DIAS_UTEIS[i];
      headHtml += `
        <th scope="col" class="border-b border-slate-100 ${hoje ? 'bg-senai-dark/[0.025]' : 'bg-white'} px-2 py-3 text-center font-normal">
          <div class="flex flex-col items-center gap-1.5">
            <span class="text-[8px] font-semibold uppercase tracking-[.18em] ${hoje ? 'text-[#B9470F]' : 'text-slate-500'}">${diaInfo.nome}</span>
            <span class="grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ${hoje ? 'bg-senai-dark text-white' : 'text-senai-dark'}">${d.getDate()}</span>
          </div>
        </th>
      `;
    }
    headHtml += '</tr>';
    head.innerHTML = headHtml;

    // Corpo
    let bodyHtml = '';
    HORARIOS_GRADE.forEach((hora) => {
      bodyHtml += '<tr>';
      bodyHtml += `
        <th scope="row" class="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-3 text-left align-top">
          <p class="text-[10.5px] font-semibold text-senai-dark">${hora}</p>
          <p class="mt-0.5 text-[7.5px] font-medium uppercase tracking-[.12em] text-slate-500">${hora < '12:00' ? 'Manhã' : 'Tarde'}</p>
        </th>
      `;

      for (let i = 0; i < 5; i++) {
        const d = adicionarDias(inicio, i);
        const dataISO = isoData(d);
        const aulas = aulasDoDiaHora(dataISO, hora);
        const hoje = isoData(new Date()) === dataISO;

        bodyHtml += `<td class="h-[102px] border-b border-slate-100 ${hoje ? 'bg-senai-dark/[0.012]' : 'bg-white'} p-1.5 align-top">`;

        if (aulas.length) {
          const aula = aulas[0];
          const titulo = aula.titulo || '';
          const sala = aula.sala || '';
          const ehConflito = /×|conflito/i.test(titulo);
          const ehLab = /^lab/i.test(sala);
          const ehPratica = /soldagem|clp|pr[áa]tica/i.test(titulo);
          const buscaCard = normalizar([titulo, sala, aula.instrutor, nomeDoDia(dataISO), dataISO, hora].join(' '));

          let cardTone = 'border-l-4 border-slate-300 bg-slate-50';
          let cardBadge = '<span class="inline-flex items-center rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">[SALA]</span>';

          if (ehConflito) {
            cardTone = 'border-l-4 border-red-500 bg-red-50';
            cardBadge = '<span class="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-700">[CONFLITO]</span>';
          } else if (ehPratica) {
            cardTone = 'border-l-4 border-orange-500 bg-orange-50';
            cardBadge = '<span class="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-700">[PRÁTICA]</span>';
          } else if (ehLab) {
            cardTone = 'border-l-4 border-blue-500 bg-blue-50';
            cardBadge = '<span class="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700">[LAB]</span>';
          }

          bodyHtml += `
            <div class="schedule-block ${cardTone} rounded-lg p-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer" data-date="${dataISO}" data-time="${hora}" data-room="${escapar(aula.sala)}" data-type="${ehLab ? 'lab' : 'sala'}" data-conflict="${ehConflito ? '1' : '0'}" data-search="${escapar(buscaCard)}">
              ${cardBadge}
              <p class="mt-2 text-[13px] font-semibold leading-snug text-slate-800">${escapar(aula.titulo)}</p>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-500">${escapar(aula.sala)} · ${escapar(aula.instrutor)}</p>
            </div>
          `;
        } else {
          bodyHtml += `
            <button class="empty-slot bg-slate-50/60 border border-dashed border-slate-300 hover:bg-slate-50 hover:border-[#003B5C] min-h-[120px] cursor-pointer transition-colors rounded-lg flex items-center justify-center w-full h-full" data-date="${dataISO}" data-time="${hora}" aria-label="Alocar aula">
              <i class="ph ph-plus text-[13px] text-slate-400"></i>
            </button>
          `;
        }

        bodyHtml += '</td>';
      }
      bodyHtml += '</tr>';
    });

    body.innerHTML = bodyHtml;

    // Vincula cliques nos espaços vazios.
    body.querySelectorAll('.empty-slot').forEach((slot) => {
      slot.addEventListener('click', () => {
        const dataISO = slot.dataset.date;
        const day = diaSemanaDeData(dataISO);
        if (typeof window.openDrawer === 'function') {
          window.openDrawer({ day, time: slot.dataset.time });
        }
      });
    });

    // Vincula cliques nos cards para edição.
    body.querySelectorAll('.schedule-block').forEach((card) => {
      card.addEventListener('click', () => {
        const dataISO = card.dataset.date;
        const day = diaSemanaDeData(dataISO);
        if (typeof window.openDrawer === 'function') {
          window.openDrawer({ day, time: card.dataset.time, room: card.dataset.room });
        }
      });
    });

    // Reaplica a busca e o filtro ativo depois de cada renderização.
    if (typeof window.applyGradeFilters === 'function') window.applyGradeFilters();

    sincronizarEstadoGlobal();
  }

  /* ------------------------------------------------------------------ */
  /* Carga de dados                                                      */
  /* ------------------------------------------------------------------ */

  async function atualizar(opcoes = {}) {
    const { silencioso = false } = opcoes;

    try {
      const inicioISO = isoData(semanaInicio);
      const fimISO = isoData(adicionarDias(semanaInicio, 4));

      const [resumo, conflitos, avisos, grade] = await Promise.all([
        API.requisitar('/dashboard/resumo'),
        API.requisitar(`/dashboard/conflitos?inicio=${inicioISO}&fim=${fimISO}`),
        API.requisitar('/dashboard/avisos?limite=8'),
        API.requisitar(`/dashboard/grade?inicio=${inicioISO}&fim=${fimISO}`)
      ]);

      aulasSemana = grade?.dias || [];
      sincronizarEstadoGlobal();

      pintarResumo(resumo);
      pintarConflitos(conflitos);
      pintarAvisos(avisos);
      pintarNotificacoes(avisos);
      pintarPeriodo(grade);
      renderizarGrade();
      const pickerAtual = porId('weekDatePicker');
      if (pickerAtual) pickerAtual.value = isoData(semanaInicio);
      pintarConexao(true);

      window.GestorPainel = { resumo, conflitos, avisos, alocacoes: grade };
      return true;
    } catch (erro) {
      if (erro instanceof API.ErroSessao) return false;

      console.error('[Gestor SENAI] Falha ao sincronizar o painel', erro);
      pintarConexao(false, API.mensagemDeErro(erro));
      if (!silencioso) {
        avisar('warning', 'Não foi possível sincronizar', API.mensagemDeErro(erro));
      }
      return false;
    }
  }

  function configurarAcoes() {
    const sair = () => API.sair();
    porId('logoutBtn')?.addEventListener('click', sair);
    porId('sidebarLogout')?.addEventListener('click', sair);

    porId('prevWeekButton')?.addEventListener('click', () => {
      semanaInicio = adicionarDias(semanaInicio, -7);
      atualizar();
    });

    porId('nextWeekButton')?.addEventListener('click', () => {
      semanaInicio = adicionarDias(semanaInicio, 7);
      atualizar();
    });

    porId('todayButton')?.addEventListener('click', () => {
      semanaInicio = segundaDaSemana(new Date());
      atualizar();
    });

    porId('weekDatePicker')?.addEventListener('change', (evento) => {
      const valor = evento.target.value;
      if (!valor) return;
      semanaInicio = segundaDaSemana(new Date(`${valor}T12:00:00`));
      atualizar();
    });

    porId('todayButton')?.addEventListener('click', () => {
      selecionar('#top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function iniciar() {
    configurarAcoes();
    await carregarSalas();

    try {
      const sessao = await API.requisitar('/auth/me');
      const usuario = sessao?.usuario;

      if (usuario?.papel !== 'coordenacao') {
        if (usuario?.papel === 'aluno') {
          // O aluno tem a própria área; não o deixamos preso no painel.
          window.location.replace('index.html');
        } else {
          window.location.replace('login.html?motivo=permissao');
        }
        return;
      }

      pintarUsuario(usuario);
    } catch (erro) {
      if (erro instanceof API.ErroSessao) return;
      console.error('[Gestor SENAI] Falha ao confirmar a sessão', erro);
      avisar('warning', 'Falha de conexão', API.mensagemDeErro(erro));
      return;
    }

    const picker = porId('weekDatePicker');
    if (picker) picker.value = isoData(semanaInicio);

    await atualizar();

    const picker2 = porId('weekDatePicker');
    if (picker2) picker2.value = isoData(semanaInicio);

    // Mantém os indicadores vivos sem recarregar a página.
    setInterval(() => atualizar({ silencioso: true }), 30000);
  }

  iniciar();
})();
