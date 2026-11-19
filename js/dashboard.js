/* ==========================================================================
   Gestor SENAI - painel da coordenação
   --------------------------------------------------------------------------
   Concentra a interface do dashboard: cabeçalho, busca global, grade,
   alocação, avisos, notificações e indicadores.
   Depende de js/sessao.js (window.GestorAPI).
   ========================================================================== */

(function () {
  'use strict';

  const API = window.GestorAPI;
  if (!API) {
    console.error('[Gestor SENAI] js/sessao.js não foi carregado.');
    return;
  }

  const porId = (id) => document.getElementById(id);
  const todos = (seletor) => Array.from(document.querySelectorAll(seletor));

  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const CHAVES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const NOMES_DIA = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta' };
  const HORARIOS_PADRAO = ['08:00', '10:00', '14:00', '16:00', '19:00'];
  const OPCOES_HORARIO = (() => {
    const lista = [];
    for (let h = 7; h <= 21; h += 1) {
      lista.push(`${String(h).padStart(2, '0')}:00`);
      if (h < 21) lista.push(`${String(h).padStart(2, '0')}:30`);
    }
    return lista;
  })();

  const CORES_AVISO = {
    sala: 'bg-senai-orange',
    material: 'bg-sky-500',
    evento: 'bg-emerald-500',
    cancelamento: 'bg-rose-500',
    sistema: 'bg-slate-300'
  };

  const ROTULOS_AVISO = {
    sala: 'Sala',
    material: 'Material',
    evento: 'Evento',
    cancelamento: 'Cancelamento',
    sistema: 'Sistema'
  };

  const CHAVE_LIDAS = 'gestor-senai.notificacoes-lidas';
  const CHAVE_PREFERENCIAS = 'gestor-senai.preferencias-coordenacao';

  const estado = {
    usuario: API.usuario(),
    semanaInicio: segundaDaSemana(new Date()),
    diaFoco: isoData(new Date()),
    modo: 'semana',
    aulasSemana: [],
    salas: [],
    alunos: [],
    instrutores: [],
    resumo: null,
    conflitos: [],
    avisos: [],
    filtro: 'all',
    busca: '',
    resultadosBusca: [],
    indiceBusca: -1,
    editando: null,
    conflitoFormulario: null,
    avisoEditando: null,
    notificacoesLidas: new Set(lerLista(CHAVE_LIDAS)),
    preferencias: lerObjeto(CHAVE_PREFERENCIAS) || { conflitos: true, avisos: true },
    carregando: false
  };

  /* ------------------------------------------------------------------ */
  /* Utilitários                                                         */
  /* ------------------------------------------------------------------ */

  function lerLista(chave) {
    try {
      const valor = JSON.parse(localStorage.getItem(chave) || '[]');
      return Array.isArray(valor) ? valor : [];
    } catch (erro) {
      return [];
    }
  }

  function lerObjeto(chave) {
    try {
      const valor = JSON.parse(localStorage.getItem(chave) || 'null');
      return valor && typeof valor === 'object' ? valor : null;
    } catch (erro) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      /* armazenamento indisponível não deve interromper a tela */
    }
  }

  function segundaDaSemana(data) {
    const d = new Date(data);
    const dia = d.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isoData(data) {
    const d = new Date(data);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  function dataDeISO(iso) {
    return new Date(`${iso}T12:00:00`);
  }

  function adicionarDias(data, dias) {
    const d = new Date(data);
    d.setDate(d.getDate() + dias);
    return d;
  }

  function chaveDoDia(iso) {
    const d = dataDeISO(iso);
    return CHAVES_DIA[d.getDay()] || 'seg';
  }

  function dataCurta(iso) {
    const data = dataDeISO(iso);
    return Number.isNaN(data.getTime()) ? iso : `${data.getDate()} ${MESES_CURTOS[data.getMonth()]}`;
  }

  function nomeDoDia(iso) {
    const data = dataDeISO(iso);
    if (Number.isNaN(data.getTime())) return '';
    return DIAS_LONGOS[data.getDay()];
  }

  function nomeCurtoDoDia(iso) {
    const data = dataDeISO(iso);
    if (Number.isNaN(data.getTime())) return '';
    const nome = DIAS_CURTOS[data.getDay()];
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  function dataLonga(iso) {
    const data = dataDeISO(iso);
    if (Number.isNaN(data.getTime())) return iso;
    return `${nomeDoDia(iso)}, ${data.getDate()} de ${MESES_LONGOS[data.getMonth()]}`;
  }

  function formatarPeriodo(inicio, fim) {
    const de = dataDeISO(inicio);
    const ate = dataDeISO(fim);
    if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return `${inicio} a ${fim}`;
    if (de.getMonth() === ate.getMonth()) {
      return `${de.getDate()} a ${ate.getDate()} de ${MESES_CURTOS[de.getMonth()]} de ${ate.getFullYear()}`;
    }
    return `${de.getDate()} de ${MESES_CURTOS[de.getMonth()]} a ${ate.getDate()} de ${MESES_CURTOS[ate.getMonth()]} de ${ate.getFullYear()}`;
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

  function minutos(hora) {
    const [h, m] = String(hora || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function somarMinutos(hora, quantidade) {
    const total = Math.min(23 * 60 + 59, Math.max(0, minutos(hora) + quantidade));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function sobrepoe(inicioA, fimA, inicioB, fimB) {
    return minutos(inicioA) < minutos(fimB) && minutos(inicioB) < minutos(fimA);
  }

  function normalizar(valor) {
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
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

  function tempoRelativo(valor) {
    if (!valor) return '';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    const minutosAtras = Math.floor((Date.now() - data.getTime()) / 60000);
    if (minutosAtras < 1) return 'agora';
    if (minutosAtras < 60) return `${minutosAtras} min`;
    const horas = Math.floor(minutosAtras / 60);
    if (horas < 24) return `${horas} h`;
    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'ontem';
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function horariosDaGrade() {
    const conjunto = new Set(HORARIOS_PADRAO);
    estado.aulasSemana.forEach((dia) => {
      (dia.aulas || []).forEach((aula) => conjunto.add(aula.inicio.slice(0, 5)));
    });
    return Array.from(conjunto).sort();
  }

  function periodoDoHorario(hora) {
    const h = Number(String(hora).slice(0, 2));
    if (h < 12) return 'Manhã';
    if (h < 18) return 'Tarde';
    return 'Noite';
  }

  /* ------------------------------------------------------------------ */
  /* Toast e feedback                                                    */
  /* ------------------------------------------------------------------ */

  const dashToast = porId('dashToast');
  let toastTimer = null;

  const TONS_TOAST = {
    success: { wrap: 'bg-emerald-50 text-emerald-600', icon: 'ph-check-circle' },
    warning: { wrap: 'bg-senai-orange/10 text-senai-orange', icon: 'ph-warning-circle' },
    info: { wrap: 'bg-senai-mist text-senai-dark', icon: 'ph-info' }
  };

  function mostrarToast(tipo, titulo, texto) {
    if (!dashToast) return;
    const config = TONS_TOAST[tipo] || TONS_TOAST.info;
    const icone = porId('dashToastIcon');
    const glifo = porId('dashToastIconGlyph');

    if (icone) icone.className = `grid h-9 w-9 shrink-0 place-items-center rounded-xl ${config.wrap}`;
    if (glifo) glifo.className = `ph-fill ${config.icon} text-[18px]`;
    if (porId('dashToastTitle')) porId('dashToastTitle').textContent = titulo;
    if (porId('dashToastText')) porId('dashToastText').textContent = texto;

    clearTimeout(toastTimer);
    dashToast.inert = false;
    dashToast.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      dashToast.classList.remove('is-visible');
      dashToast.inert = true;
    }, 5000);
  }

  window.showToast = mostrarToast;

  function fecharToast() {
    if (!dashToast) return;
    clearTimeout(toastTimer);
    dashToast.classList.remove('is-visible');
    dashToast.inert = true;
  }

  /* ------------------------------------------------------------------ */
  /* Cabeçalho, menu e rodapé                                            */
  /* ------------------------------------------------------------------ */

  function pintarUsuario(usuario) {
    const nome = usuario?.nome || 'Coordenação';
    const iniciais = usuario?.iniciais || 'CP';
    const completa = usuario?.nome_completo || 'Coordenação acadêmica';

    if (porId('headerUserName')) porId('headerUserName').textContent = nome;
    if (porId('headerInitials')) porId('headerInitials').textContent = iniciais;
    if (porId('sidebarName')) porId('sidebarName').textContent = nome;
    if (porId('sidebarInitials')) porId('sidebarInitials').textContent = iniciais;
    if (porId('profileMenuName')) porId('profileMenuName').textContent = nome;
    if (porId('profileMenuRole')) porId('profileMenuRole').textContent = completa;
  }

  function pintarConexao(ok, mensagem) {
    const rodape = porId('footerStatus');
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
        ? 'inline-flex items-center gap-1 rounded-xl bg-orange-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#B9470F]'
        : 'inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700';
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
        selo.className = 'inline-flex items-center gap-1.5 rounded-xl border border-senai-orange/15 bg-senai-orange/[0.08] px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[.08em] text-[#B9470F]';
        selo.innerHTML = '<span class="h-1 w-1 rounded-full bg-senai-orange"></span>Requer atenção';
      } else {
        selo.className = 'inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[.08em] text-emerald-700';
        selo.innerHTML = '<span class="h-1 w-1 rounded-full bg-emerald-500"></span>Grade consistente';
      }
    }

    if (detalhe) {
      if (!total) {
        detalhe.textContent = 'Nenhum choque de sala ou instrutor.';
      } else {
        const primeiro = conflitos[0];
        detalhe.textContent = `${nomeCurtoDoDia(primeiro.data)} · ${primeiro.inicio} · ${primeiro.recurso}`;
      }
    }

    if (botao) botao.hidden = total === 0;
  }

  function pintarPeriodo() {
    const grade = { inicio: isoData(estado.semanaInicio), fim: isoData(adicionarDias(estado.semanaInicio, 4)) };
    const periodo = formatarPeriodo(grade.inicio, grade.fim);
    const todas = estado.aulasSemana.reduce((soma, dia) => soma + (dia.aulas?.length || 0), 0);
    const diaAtual = estado.aulasSemana.find((dia) => dia.data === estado.diaFoco);
    const totalDia = diaAtual?.aulas?.length || 0;
    const aula = estado.modo === 'dia' ? totalDia : todas;

    if (porId('periodoLabel')) {
      porId('periodoLabel').textContent = estado.modo === 'dia' ? dataLonga(estado.diaFoco) : periodo;
    }
    if (porId('periodoGrade')) {
      porId('periodoGrade').textContent = estado.modo === 'dia' ? dataLonga(estado.diaFoco) : periodo;
    }
    if (porId('allocationCount')) {
      porId('allocationCount').textContent = `${aula} aula${aula === 1 ? '' : 's'} ${estado.modo === 'dia' ? 'no dia' : 'na semana'}`;
    }
    if (porId('weekBadge')) {
      porId('weekBadge').textContent = estado.modo === 'dia'
        ? `Dia ${dataDeISO(estado.diaFoco).getDate()}`
        : `Semana ${numeroDaSemana(estado.semanaInicio)}`;
    }
    if (porId('weekEyebrow')) {
      porId('weekEyebrow').textContent = estado.modo === 'dia'
        ? dataCurta(estado.diaFoco)
        : `Semana ${numeroDaSemana(estado.semanaInicio)}`;
    }
    if (porId('gradeTitle')) {
      porId('gradeTitle').textContent = estado.modo === 'dia' ? 'Programação do dia' : 'Programação semanal';
    }
    if (porId('prevPeriodLabel')) {
      porId('prevPeriodLabel').textContent = estado.modo === 'dia' ? 'Dia anterior' : 'Semana anterior';
    }
    if (porId('nextPeriodLabel')) {
      porId('nextPeriodLabel').textContent = estado.modo === 'dia' ? 'Próximo dia' : 'Próxima semana';
    }
  }

  function abrirDetalheOcupacao() {
    const hoje = isoData(new Date());
    const noPeriodo = estado.aulasSemana.some((dia) => dia.data === hoje);
    const doDia = estado.aulasSemana.find((dia) => dia.data === hoje)?.aulas || [];
    const labs = estado.salas.filter((sala) => sala.tipo === 'lab');
    const linhas = labs.map((sala) => {
      const aulas = doDia.filter((aula) => aula.sala === sala.nome);
      const pct = Math.min(100, Math.round((aulas.length / 4) * 100));
      return `
        <div class="border-b border-slate-100 py-3 last:border-0">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10.5px] font-semibold text-senai-dark">${escapar(sala.nome)}</p>
              <p class="mt-0.5 text-[9.5px] text-slate-500">${escapar(sala.bloco)} · ${escapar(sala.andar)}</p>
            </div>
            <span class="shrink-0 text-[9.5px] font-semibold text-slate-600">${aulas.length} aula${aulas.length === 1 ? '' : 's'}</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-senai-dark" style="width:${pct}%"></div>
          </div>
          <p class="mt-1.5 text-[9.5px] text-slate-500">${aulas.length ? aulas.map((aula) => `${aula.inicio}-${aula.fim}`).join(' · ') : 'Livre hoje'}</p>
        </div>`;
    }).join('');

    const corpo = `
      <div class="rounded-xl bg-senai-mist p-3.5">
        <p class="text-[10px] font-semibold text-senai-dark">Ocupação atual: ${Number(estado.resumo?.ocupacaoPercent) || 0}%</p>
        <p class="mt-1 text-[9.5px] text-slate-500">${Number(estado.resumo?.labsEmUso) || 0} de ${Number(estado.resumo?.totalLabs) || 0} laboratórios em uso hoje.</p>
      </div>
      ${noPeriodo ? `<div class="mt-3">${linhas || '<p class="py-4 text-center text-[9.5px] text-slate-500">Nenhum laboratório cadastrado.</p>'}</div>` : '<p class="mt-4 text-[9.5px] text-slate-500">A semana exibida não inclui hoje. Volte para a semana atual para ver a ocupação detalhada.</p>'}`;

    abrirInfo('Ocupação dos laboratórios', dataLonga(hoje), corpo);
  }

  function abrirDetalheAulas() {
    const hoje = isoData(new Date());
    const noPeriodo = estado.aulasSemana.some((dia) => dia.data === hoje);
    const aulas = (estado.aulasSemana.find((dia) => dia.data === hoje)?.aulas || [])
      .slice()
      .sort((a, b) => minutos(a.inicio) - minutos(b.inicio));

    const corpo = !noPeriodo
      ? '<p class="py-4 text-center text-[9.5px] text-slate-500">A semana exibida não inclui hoje. Use "Hoje" para voltar à semana atual.</p>'
      : aulas.length
        ? `<div class="divide-y divide-slate-100">${aulas.map((aula) => `
            <button type="button" data-info-aula="${escapar(aula.id)}" class="flex w-full items-start gap-3 py-3 text-left transition hover:bg-slate-50">
              <span class="mt-0.5 w-[46px] shrink-0 text-[9.5px] font-semibold text-senai-dark">${escapar(aula.inicio)}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-[10.5px] font-semibold text-senai-dark">${escapar(aula.titulo)}</p>
                <p class="mt-0.5 text-[9.5px] text-slate-500">${escapar(aula.sala)} · ${escapar(aula.instrutor)}</p>
                <p class="mt-0.5 text-[9px] text-slate-400">${escapar(aula.aluno)} · ${escapar(aula.inicio)}-${escapar(aula.fim)}</p>
              </div>
              <i class="ph ph-caret-right mt-1 shrink-0 text-[11px] text-slate-300"></i>
            </button>`).join('')}</div>`
        : '<p class="py-4 text-center text-[9.5px] text-slate-500">Nenhuma aula programada para hoje.</p>';

    abrirInfo('Aulas de hoje', `${aulas.length} aula${aulas.length === 1 ? '' : 's'} em ${dataLonga(hoje)}`, corpo);
  }

  function abrirListaConflitos() {
    const corpo = estado.conflitos.length
      ? `<div class="divide-y divide-slate-100">${estado.conflitos.map((conflito, indice) => `
          <div class="flex items-start gap-3 py-3">
            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"></span>
            <div class="min-w-0 flex-1">
              <p class="text-[10.5px] font-semibold text-senai-dark">Choque de ${escapar(conflito.tipo === 'sala' ? 'sala' : 'instrutor')}: ${escapar(conflito.recurso)}</p>
              <p class="mt-0.5 text-[9.5px] text-slate-500">${escapar(nomeCurtoDoDia(conflito.data))}, ${escapar(dataCurta(conflito.data))} · ${escapar(conflito.inicio)}-${escapar(conflito.fim)}</p>
              <p class="mt-0.5 text-[9.5px] leading-relaxed text-slate-500">${escapar(conflito.detalhe)}</p>
            </div>
            <button type="button" data-ir-conflito="${indice}" class="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-semibold text-senai-dark transition hover:border-senai-dark/30">Ver na grade</button>
          </div>`).join('')}</div>`
      : '<p class="py-6 text-center text-[9.5px] text-slate-500">Nenhum conflito identificado nesta semana.</p>';

    abrirInfo('Conflitos da semana', `${estado.conflitos.length} ocorrência${estado.conflitos.length === 1 ? '' : 's'} detectada${estado.conflitos.length === 1 ? '' : 's'}`, corpo);
  }

  function irParaConflito(indice) {
    const conflito = estado.conflitos[indice];
    if (!conflito) return;
    estado.semanaInicio = segundaDaSemana(dataDeISO(conflito.data));
    estado.diaFoco = conflito.data;
    estado.modo = 'dia';
    estado.filtro = 'conflict';
    fecharInfo();
    atualizar().then(() => {
      porId('grade')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Popovers do cabeçalho                                               */
  /* ------------------------------------------------------------------ */

  function fecharMenuPerfil() {
    porId('profileMenu')?.classList.add('hidden');
    porId('profileButton')?.setAttribute('aria-expanded', 'false');
  }

  function fecharSino() {
    porId('bellPopover')?.classList.add('hidden');
    porId('bellButton')?.setAttribute('aria-expanded', 'false');
  }

  function alternarMenuPerfil() {
    const menu = porId('profileMenu');
    const botao = porId('profileButton');
    if (!menu || !botao) return;
    const abrir = menu.classList.contains('hidden');
    fecharSino();
    menu.classList.toggle('hidden', !abrir);
    botao.setAttribute('aria-expanded', String(abrir));
  }

  function alternarSino() {
    const painel = porId('bellPopover');
    const botao = porId('bellButton');
    if (!painel || !botao) return;
    const abrir = painel.classList.contains('hidden');
    fecharMenuPerfil();
    painel.classList.toggle('hidden', !abrir);
    botao.setAttribute('aria-expanded', String(abrir));
    if (abrir) renderizarNotificacoes();
  }

  /* ------------------------------------------------------------------ */
  /* Central de notificações                                             */
  /* ------------------------------------------------------------------ */

  function itensDeNotificacao() {
    const itens = [];

    if (estado.preferencias.avisos) {
      estado.avisos.forEach((aviso) => {
        itens.push({
          id: `aviso:${aviso.id}`,
          origem: 'aviso',
          referencia: aviso,
          titulo: aviso.titulo,
          texto: aviso.texto,
          quando: aviso.quando,
          momento: new Date(aviso.quando).getTime() || 0,
          rotulo: 'Aviso'
        });
      });
    }

    if (estado.preferencias.conflitos) {
      estado.conflitos.forEach((conflito) => {
        itens.push({
          id: `conflito:${conflito.data}:${conflito.inicio}:${conflito.tipo}:${conflito.recurso}`,
          origem: 'conflito',
          referencia: conflito,
          titulo: `Conflito de ${conflito.tipo}`,
          texto: `${conflito.recurso} · ${dataCurta(conflito.data)} ${conflito.inicio}-${conflito.fim}`,
          quando: `${conflito.data}T${conflito.inicio}:00`,
          momento: new Date(`${conflito.data}T${conflito.inicio}:00`).getTime() || 0,
          rotulo: 'Conflito'
        });
      });
    }

    return itens.sort((a, b) => b.momento - a.momento);
  }

  function renderizarNotificacoes() {
    const lista = porId('bellList');
    const ponto = porId('headerBellDot');
    const subtitulo = porId('bellSubtitle');
    if (!lista) return;

    const itens = itensDeNotificacao();
    const naoLidas = itens.filter((item) => !estado.notificacoesLidas.has(item.id));

    if (ponto) ponto.hidden = naoLidas.length === 0;
    if (subtitulo) {
      subtitulo.textContent = naoLidas.length
        ? `${naoLidas.length} não lida${naoLidas.length === 1 ? '' : 's'}`
        : 'Tudo em dia';
    }

    if (!itens.length) {
      lista.innerHTML = `
        <div class="py-7 text-center">
          <i class="ph ph-bell-slash text-[22px] text-slate-300"></i>
          <p class="mt-2 text-[10px] font-medium text-senai-dark">Nenhuma notificação</p>
          <p class="mt-1 text-[9.5px] text-slate-500">Avisos e conflitos aparecem aqui.</p>
        </div>`;
      return;
    }

    lista.innerHTML = itens.slice(0, 8).map((item) => {
      const lida = estado.notificacoesLidas.has(item.id);
      const cor = item.origem === 'conflito'
        ? 'bg-red-500'
        : (CORES_AVISO[item.referencia.tipo] || CORES_AVISO.sistema);
      return `
        <div class="flex items-start gap-2.5 border-b border-slate-50 py-2.5 last:border-0">
          <button type="button" data-notificacao="${escapar(item.id)}" class="flex min-w-0 flex-1 items-start gap-2.5 text-left">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${lida ? 'bg-slate-200' : cor}"></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[10px] font-semibold ${lida ? 'text-slate-500' : 'text-senai-dark'}">${escapar(item.titulo)}</span>
              <span class="mt-0.5 block truncate text-[9.5px] text-slate-500">${escapar(item.texto)}</span>
              <span class="mt-0.5 block text-[9px] text-slate-400">${escapar(item.rotulo)} · ${escapar(tempoRelativo(item.quando))}</span>
            </span>
          </button>
          ${lida ? '' : `<button type="button" data-marcar-lida="${escapar(item.id)}" aria-label="Marcar como lida" title="Marcar como lida" class="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600"><i class="ph ph-check text-[11px]"></i></button>`}
        </div>`;
    }).join('');
  }

  function marcarLida(id) {
    estado.notificacoesLidas.add(id);
    gravar(CHAVE_LIDAS, Array.from(estado.notificacoesLidas).slice(-300));
    renderizarNotificacoes();
  }

  function marcarTodasLidas() {
    itensDeNotificacao().forEach((item) => estado.notificacoesLidas.add(item.id));
    gravar(CHAVE_LIDAS, Array.from(estado.notificacoesLidas).slice(-300));
    renderizarNotificacoes();
    mostrarToast('success', 'Notificações lidas', 'O indicador do sino foi atualizado.');
  }

  function abrirNotificacao(id) {
    const item = itensDeNotificacao().find((notificacao) => notificacao.id === id);
    if (!item) return;
    marcarLida(id);
    fecharSino();

    if (item.origem === 'conflito') {
      abrirListaConflitos();
      return;
    }

    abrirInfo(item.titulo, `${ROTULOS_AVISO[item.referencia.tipo] || 'Aviso'} · ${tempoRelativo(item.referencia.quando)}`, `
      <p class="text-[10.5px] leading-relaxed text-slate-600">${escapar(item.referencia.texto)}</p>
      <div class="mt-4 rounded-xl bg-slate-50 p-3 text-[9.5px] text-slate-500">
        <p><span class="font-semibold text-senai-dark">Destinatário:</span> ${escapar(item.referencia.destinatario)}</p>
        <p class="mt-1"><span class="font-semibold text-senai-dark">Publicado:</span> ${escapar(new Date(item.referencia.quando).toLocaleString('pt-BR'))}</p>
      </div>`);
  }

  /* ------------------------------------------------------------------ */
  /* Busca global                                                        */
  /* ------------------------------------------------------------------ */

  function fecharResultadosBusca() {
    porId('searchResults')?.classList.add('hidden');
    estado.indiceBusca = -1;
  }

  function montarResultadosBusca(termo) {
    const consulta = normalizar(termo);
    if (!consulta) return [];

    const resultados = [];

    estado.aulasSemana.forEach((dia) => {
      (dia.aulas || []).forEach((aula) => {
        const texto = normalizar(`${aula.titulo} ${aula.subtitulo || ''} ${aula.sala} ${aula.instrutor} ${aula.aluno} ${dia.data} ${aula.inicio}`);
        if (texto.includes(consulta)) {
          resultados.push({
            tipo: 'aula',
            id: aula.id,
            titulo: aula.titulo,
            detalhe: `${nomeCurtoDoDia(dia.data)}, ${dataCurta(dia.data)} · ${aula.inicio}-${aula.fim} · ${aula.sala}`,
            referencia: aula,
            dataISO: dia.data
          });
        }
      });
    });

    estado.salas.forEach((sala) => {
      const texto = normalizar(`${sala.nome} ${sala.tipo} ${sala.bloco} ${sala.andar} ${sala.direcoes}`);
      if (texto.includes(consulta)) {
        resultados.push({
          tipo: 'sala',
          id: sala.id,
          titulo: sala.nome,
          detalhe: `${sala.tipo === 'lab' ? 'Laboratório' : 'Sala'} · ${sala.bloco}, ${sala.andar}`,
          valor: sala.nome
        });
      }
    });

    estado.instrutores.forEach((instrutor) => {
      if (normalizar(instrutor.nome).includes(consulta)) {
        resultados.push({
          tipo: 'instrutor',
          id: instrutor.id,
          titulo: instrutor.nome,
          detalhe: 'Instrutor',
          valor: instrutor.nome
        });
      }
    });

    estado.alunos.forEach((aluno) => {
      const texto = normalizar(`${aluno.nome} ${aluno.matricula} ${aluno.curso} ${aluno.turno}`);
      if (texto.includes(consulta)) {
        resultados.push({
          tipo: 'aluno',
          id: aluno.id,
          titulo: aluno.nome,
          detalhe: `${aluno.matricula} · ${aluno.curso}`,
          valor: aluno.nome
        });
      }
    });

    estado.avisos.forEach((aviso) => {
      const texto = normalizar(`${aviso.titulo} ${aviso.texto} ${aviso.destinatario}`);
      if (texto.includes(consulta)) {
        resultados.push({
          tipo: 'aviso',
          id: aviso.id,
          titulo: aviso.titulo,
          detalhe: `Aviso · ${aviso.destinatario}`,
          referencia: aviso
        });
      }
    });

    const ordem = { aula: 0, sala: 1, instrutor: 2, aluno: 3, aviso: 4 };
    return resultados.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]).slice(0, 10);
  }

  const ROTULOS_RESULTADO = { aula: 'Aula', sala: 'Sala', instrutor: 'Instrutor', aluno: 'Aluno', aviso: 'Aviso' };

  function renderizarResultadosBusca() {
    const painel = porId('searchResults');
    if (!painel) return;

    const termo = porId('globalSearch')?.value || '';
    estado.resultadosBusca = montarResultadosBusca(termo);
    estado.indiceBusca = -1;

    if (!termo.trim()) {
      fecharResultadosBusca();
      return;
    }

    if (!estado.resultadosBusca.length) {
      painel.innerHTML = `
        <div class="px-3 py-5 text-center">
          <p class="text-[10px] font-medium text-senai-dark">Nenhum resultado</p>
          <p class="mt-1 text-[9.5px] text-slate-500">Tente sala, laboratório, instrutor, aluno ou aviso.</p>
        </div>`;
      painel.classList.remove('hidden');
      return;
    }

    painel.innerHTML = estado.resultadosBusca.map((item, indice) => `
      <button type="button" role="option" data-resultado="${indice}" aria-selected="false" class="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50">
        <span class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-senai-mist text-[9.5px] font-semibold text-senai-dark">${escapar(ROTULOS_RESULTADO[item.tipo].slice(0, 2))}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[10px] font-semibold text-senai-dark">${escapar(item.titulo)}</span>
          <span class="block truncate text-[9.5px] text-slate-500">${escapar(item.detalhe)}</span>
        </span>
        <span class="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-slate-500">${escapar(ROTULOS_RESULTADO[item.tipo])}</span>
      </button>`).join('');
    painel.classList.remove('hidden');
  }

  function ativarResultado(indice) {
    const item = estado.resultadosBusca[indice];
    if (!item) return;
    fecharResultadosBusca();

    if (item.tipo === 'aula') {
      abrirDrawer({ aula: item.referencia, dataISO: item.dataISO });
      return;
    }

    if (item.tipo === 'aviso') {
      abrirCentralAvisos();
      if (porId('noticeSearch')) porId('noticeSearch').value = item.titulo;
      estado.avisoBusca = item.titulo;
      renderizarAvisosAdmin();
      return;
    }

    const entrada = porId('globalSearch');
    if (entrada) entrada.value = item.valor;
    estado.busca = item.valor;
    renderizarGrade();
    porId('grade')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function moverSelecaoBusca(passo) {
    if (!estado.resultadosBusca.length) return;
    const painel = porId('searchResults');
    const botoes = painel ? Array.from(painel.querySelectorAll('[data-resultado]')) : [];
    estado.indiceBusca = (estado.indiceBusca + passo + botoes.length) % botoes.length;
    botoes.forEach((botao, indice) => {
      const ativo = indice === estado.indiceBusca;
      botao.setAttribute('aria-selected', String(ativo));
      botao.classList.toggle('bg-slate-50', ativo);
    });
    botoes[estado.indiceBusca]?.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------------ */
  /* Modal genérico                                                      */
  /* ------------------------------------------------------------------ */

  function abrirInfo(titulo, subtitulo, html) {
    const modal = porId('infoModal');
    if (!modal) return;
    if (porId('infoModalTitle')) porId('infoModalTitle').textContent = titulo;
    if (porId('infoModalSubtitle')) porId('infoModalSubtitle').textContent = subtitulo || '';
    if (porId('infoModalBody')) porId('infoModalBody').innerHTML = html || '';
    modal.classList.remove('hidden');
    modal.querySelector('[data-close-info]')?.focus();
  }

  function fecharInfo() {
    porId('infoModal')?.classList.add('hidden');
  }

  /* ------------------------------------------------------------------ */
  /* Perfil e preferências                                               */
  /* ------------------------------------------------------------------ */

  async function abrirPerfil() {
    fecharMenuPerfil();
    const usuario = estado.usuario || {};

    abrirInfo('Meu perfil', 'Dados da conta da coordenação', `
      <div class="flex items-center gap-3">
        <span class="grid h-12 w-12 place-items-center rounded-full bg-senai-dark text-[13px] font-semibold text-white">${escapar(usuario.iniciais || 'CP')}</span>
        <div class="min-w-0">
          <p class="truncate text-[12px] font-semibold text-senai-dark">${escapar(usuario.nome_completo || usuario.nome || 'Coordenação')}</p>
          <p class="mt-0.5 text-[9.5px] text-slate-500">${escapar(usuario.matricula || '')} · Coordenação acadêmica</p>
        </div>
      </div>

      <form id="profilePasswordForm" class="mt-5 border-t border-slate-100 pt-4">
        <p class="text-[10px] font-semibold text-senai-dark">Alterar senha</p>
        <p class="mt-0.5 text-[9.5px] text-slate-500">Use no mínimo 8 caracteres.</p>
        <label class="mt-3 block">
          <span class="text-[9.5px] font-semibold uppercase tracking-[.12em] text-slate-500">Senha atual</span>
          <input id="senhaAtual" type="password" autocomplete="current-password" required class="mt-1 w-full rounded-lg border border-senai-line px-3 py-2 text-[11px] outline-none focus:border-senai-dark/30" />
        </label>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[9.5px] font-semibold uppercase tracking-[.12em] text-slate-500">Nova senha</span>
            <input id="senhaNova" type="password" autocomplete="new-password" minlength="8" required class="mt-1 w-full rounded-lg border border-senai-line px-3 py-2 text-[11px] outline-none focus:border-senai-dark/30" />
          </label>
          <label class="block">
            <span class="text-[9.5px] font-semibold uppercase tracking-[.12em] text-slate-500">Confirmar</span>
            <input id="senhaConfirma" type="password" autocomplete="new-password" minlength="8" required class="mt-1 w-full rounded-lg border border-senai-line px-3 py-2 text-[11px] outline-none focus:border-senai-dark/30" />
          </label>
        </div>
        <div id="senhaFeedback" class="mt-3 hidden rounded-lg border p-2.5 text-[9.5px]" role="alert"></div>
        <button type="submit" class="mt-3 w-full rounded-lg bg-senai-dark py-2.5 text-[10px] font-semibold text-white transition hover:bg-[#00496F]">Salvar nova senha</button>
      </form>`);

    porId('profilePasswordForm')?.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const atual = porId('senhaAtual').value;
      const nova = porId('senhaNova').value;
      const confirma = porId('senhaConfirma').value;
      const feedback = porId('senhaFeedback');

      const exibir = (mensagem, erro) => {
        if (!feedback) return;
        feedback.className = `mt-3 rounded-lg border p-2.5 text-[9.5px] ${erro ? 'border-red-200 bg-red-50 text-red-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`;
        feedback.textContent = mensagem;
      };

      if (nova !== confirma) {
        exibir('A confirmação não confere com a nova senha.', true);
        return;
      }
      if (nova.length < 8) {
        exibir('A nova senha precisa ter ao menos 8 caracteres.', true);
        return;
      }

      try {
        await API.requisitar('/auth/senha', {
          metodo: 'POST',
          corpo: { senhaAtual: atual, novaSenha: nova }
        });
        exibir('Senha atualizada com sucesso.', false);
        porId('senhaAtual').value = '';
        porId('senhaNova').value = '';
        porId('senhaConfirma').value = '';
        mostrarToast('success', 'Senha atualizada', 'A nova senha já está valendo.');
      } catch (erro) {
        if (erro instanceof API.ErroSessao) return;
        exibir(API.mensagemDeErro(erro), true);
      }
    });
  }

  function abrirPreferencias() {
    fecharMenuPerfil();
    abrirInfo('Configurações', 'Preferências deste navegador', `
      <div class="space-y-3">
        <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-senai-line p-3.5">
          <span>
            <span class="block text-[10px] font-semibold text-senai-dark">Mostrar conflitos no sino</span>
            <span class="mt-0.5 block text-[9.5px] text-slate-500">Inclui os choques de sala e instrutor nas notificações.</span>
          </span>
          <input id="prefConflitos" type="checkbox" ${estado.preferencias.conflitos ? 'checked' : ''} class="mt-0.5 h-4 w-4 rounded border-slate-300 text-senai-orange focus:ring-senai-orange" />
        </label>
        <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-senai-line p-3.5">
          <span>
            <span class="block text-[10px] font-semibold text-senai-dark">Mostrar avisos no sino</span>
            <span class="mt-0.5 block text-[9.5px] text-slate-500">Inclui os comunicados publicados aos alunos.</span>
          </span>
          <input id="prefAvisos" type="checkbox" ${estado.preferencias.avisos ? 'checked' : ''} class="mt-0.5 h-4 w-4 rounded border-slate-300 text-senai-orange focus:ring-senai-orange" />
        </label>
      </div>
      <div class="mt-4 border-t border-slate-100 pt-4">
        <button id="limparLidas" type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[9.5px] font-semibold text-slate-600 transition hover:bg-slate-50">
          <i class="ph ph-arrow-counter-clockwise text-[12px]"></i>
          Restaurar notificações lidas
        </button>
        <p class="mt-2 text-[9px] text-slate-400">As preferências ficam salvas apenas neste navegador.</p>
      </div>`);

    const salvar = () => {
      estado.preferencias = {
        conflitos: Boolean(porId('prefConflitos')?.checked),
        avisos: Boolean(porId('prefAvisos')?.checked)
      };
      gravar(CHAVE_PREFERENCIAS, estado.preferencias);
      renderizarNotificacoes();
    };

    porId('prefConflitos')?.addEventListener('change', salvar);
    porId('prefAvisos')?.addEventListener('change', salvar);
    porId('limparLidas')?.addEventListener('click', () => {
      estado.notificacoesLidas.clear();
      gravar(CHAVE_LIDAS, []);
      renderizarNotificacoes();
      mostrarToast('info', 'Notificações restauradas', 'Os indicadores voltaram a aparecer.');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Grade                                                               */
  /* ------------------------------------------------------------------ */

  function diasVisiveis() {
    if (estado.modo === 'dia') {
      return [{ dataISO: estado.diaFoco, chave: chaveDoDia(estado.diaFoco) }];
    }
    return [0, 1, 2, 3, 4].map((indice) => {
      const data = adicionarDias(estado.semanaInicio, indice);
      return { dataISO: isoData(data), chave: CHAVES_DIA[data.getDay()] };
    });
  }

  function aulasDoHorario(dataISO, hora) {
    const dia = estado.aulasSemana.find((item) => item.data === dataISO);
    if (!dia) return [];
    return (dia.aulas || [])
      .filter((aula) => aula.inicio.slice(0, 5) === hora)
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }

  function conflitosDaAula(aula, dataISO) {
    return estado.conflitos.filter((conflito) => {
      if (conflito.data !== dataISO) return false;
      if (!sobrepoe(aula.inicio, aula.fim, conflito.inicio, conflito.fim)) return false;
      if (conflito.tipo === 'sala') return conflito.recurso === aula.sala;
      return conflito.recurso === aula.instrutor;
    });
  }

  function cartaoAula(aula, dataISO, hora) {
    const conflitos = conflitosDaAula(aula, dataISO);
    const ehConflito = conflitos.length > 0;
    const ehLab = /^lab/i.test(aula.sala);
    const pratica = aula.tipo === 'prática';
    const salaTeorica = !ehLab;

    let tom = 'border-slate-300 bg-slate-50';
    let selo = '<span class="inline-flex items-center rounded bg-slate-200 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-600">SALA</span>';

    if (pratica) {
      tom = 'border-orange-500 bg-orange-50';
      selo = '<span class="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-orange-700">PRÁTICA</span>';
    } else if (ehLab) {
      tom = 'border-blue-500 bg-blue-50';
      selo = '<span class="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-blue-700">LAB</span>';
    } else if (salaTeorica) {
      tom = 'border-slate-300 bg-slate-50';
    }

    if (ehConflito) {
      tom = 'border-red-500 bg-red-50';
      selo = '<span class="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-red-700">CONFLITO</span>';
    }

    const busca = normalizar([
      aula.titulo,
      aula.subtitulo,
      aula.sala,
      aula.instrutor,
      aula.aluno,
      nomeDoDia(dataISO),
      nomeCurtoDoDia(dataISO),
      dataISO,
      hora,
      aula.fim
    ].join(' '));

    return `
      <button type="button" class="schedule-block ${tom} w-full rounded-lg border-l-4 p-1.5 text-left shadow-sm transition-shadow hover:shadow-md" data-aula="${escapar(aula.id)}" data-date="${dataISO}" data-time="${escapar(aula.inicio)}" data-room="${escapar(aula.sala)}" data-type="${ehLab ? 'lab' : 'sala'}" data-conflict="${ehConflito ? '1' : '0'}" data-search="${escapar(busca)}" aria-label="Abrir alocação ${escapar(aula.titulo)}">
        <span class="flex items-center justify-between gap-1">
          ${selo}
          <span class="shrink-0 text-[9.5px] font-semibold text-slate-600">${escapar(aula.inicio)}-${escapar(aula.fim)}</span>
        </span>
        <span class="mt-1 block truncate text-[11.5px] font-semibold leading-tight text-slate-800" title="${escapar(aula.titulo)}">${escapar(aula.titulo)}</span>
        <span class="mt-0.5 block truncate text-[9.5px] font-medium text-slate-600" title="${escapar(aula.sala)} · ${escapar(aula.instrutor)}">${escapar(aula.sala)} · ${escapar(aula.instrutor)}</span>
        <span class="mt-0.5 block truncate text-[9.5px] text-slate-500" title="${escapar(aula.aluno)}">${escapar(aula.aluno)}</span>
      </button>`;
  }

  function botaoVazio(dataISO, hora, rotulo) {
    return `
      <button type="button" class="empty-slot group relative flex min-h-[64px] w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 transition" data-date="${dataISO}" data-time="${hora}" aria-label="Alocar aula em ${escapar(rotulo)} às ${escapar(hora)}" title="Clique para alocar aula aqui">
        <i class="ph ph-plus text-[14px] text-slate-400"></i>
        <span class="slot-hint pointer-events-none absolute bottom-1 text-[9.5px] font-medium text-slate-500">Clique para alocar</span>
      </button>`;
  }

  function renderizarGrade() {
    const head = porId('gradeHead');
    const body = porId('gradeBody');
    if (!head || !body) return;

    const dias = diasVisiveis();
    const horarios = horariosDaGrade();
    const hoje = isoData(new Date());
    const diaUnico = estado.modo === 'dia';

    let headHtml = '<tr>';
    headHtml += `<th scope="col" class="sticky left-0 z-20 w-[90px] border-b border-r border-slate-200 bg-white px-3 py-3 text-left"><span class="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-600">Horário</span></th>`;

    dias.forEach((dia) => {
      const data = dataDeISO(dia.dataISO);
      const atual = hoje === dia.dataISO;
      headHtml += `
        <th scope="col" class="border-b border-r border-slate-200 ${atual ? 'bg-senai-dark/[0.025]' : 'bg-white'} px-2 py-2.5 text-center font-normal">
          <div class="flex flex-col items-center gap-1.5">
            <span class="text-[9.5px] font-semibold uppercase tracking-[.12em] ${atual ? 'text-[#B9470F]' : 'text-slate-500'}">${diaUnico ? escapar(nomeDoDia(dia.dataISO)) : escapar(NOMES_DIA[dia.chave] || nomeCurtoDoDia(dia.dataISO))}</span>
            <span class="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-semibold ${atual ? 'bg-senai-dark text-white ring-2 ring-senai-dark/10' : 'text-senai-dark'}">${data.getDate()}</span>
            ${diaUnico ? `<span class="text-[9.5px] text-slate-500">${escapar(MESES_LONGOS[data.getMonth()])}</span>` : ''}
          </div>
        </th>`;
    });
    headHtml += '</tr>';
    head.innerHTML = headHtml;

    let periodoAnterior = '';
    let bodyHtml = '';

    horarios.forEach((hora) => {
      const periodo = periodoDoHorario(hora);
      const abrirPeriodo = periodo !== periodoAnterior;
      periodoAnterior = periodo;

      bodyHtml += `<tr data-horario="${hora}">`;
      bodyHtml += `
        <th scope="row" class="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 text-left align-top ${abrirPeriodo ? 'border-t-2 border-t-slate-300' : ''}">
          <p class="text-[11px] font-semibold text-senai-dark">${escapar(hora)}</p>
          <p class="mt-0.5 text-[9.5px] font-medium uppercase tracking-[.1em] ${periodo === 'Noite' ? 'text-indigo-500' : 'text-slate-500'}">${abrirPeriodo ? periodo : ''}</p>
        </th>`;

      dias.forEach((dia) => {
        const aulas = aulasDoHorario(dia.dataISO, hora);
        const atual = hoje === dia.dataISO;
        bodyHtml += `<td class="border-b border-r border-slate-200 ${atual ? 'bg-senai-dark/[0.012]' : 'bg-white'} p-1.5 align-top ${abrirPeriodo ? 'border-t-2 border-t-slate-200' : ''}">`;
        if (aulas.length) {
          bodyHtml += `<div class="space-y-1.5">${aulas.map((aula) => cartaoAula(aula, dia.dataISO, hora)).join('')}</div>`;
        } else {
          bodyHtml += botaoVazio(dia.dataISO, hora, `${nomeCurtoDoDia(dia.dataISO)} ${dataCurta(dia.dataISO)}`);
        }
        bodyHtml += '</td>';
      });

      bodyHtml += '</tr>';
    });

    body.innerHTML = bodyHtml;
    aplicarFiltros();
  }

  function aplicarFiltros() {
    const consulta = normalizar(estado.busca || porId('globalSearch')?.value || '');
    const ativo = estado.filtro !== 'all' || Boolean(consulta);
    let visiveis = 0;

    todos('.schedule-block').forEach((cartao) => {
      const tipo = cartao.dataset.type;
      const conflito = cartao.dataset.conflict === '1';
      let combinaTipo = true;

      if (estado.filtro === 'lab') combinaTipo = tipo === 'lab';
      else if (estado.filtro === 'sala') combinaTipo = tipo === 'sala';
      else if (estado.filtro === 'conflict') combinaTipo = conflito;

      const combinaBusca = !consulta || normalizar(cartao.dataset.search || cartao.textContent).includes(consulta);
      const mostrar = combinaTipo && combinaBusca;
      cartao.classList.toggle('hidden', !mostrar);
      if (mostrar) visiveis += 1;
    });

    todos('.empty-slot').forEach((slot) => {
      slot.classList.toggle('hidden', ativo);
    });

    todos('#gradeBody tr').forEach((linha) => {
      if (!ativo) {
        linha.classList.remove('hidden');
        return;
      }
      const temCartao = linha.querySelector('.schedule-block:not(.hidden)');
      linha.classList.toggle('hidden', !temCartao);
    });

    const contador = porId('filterResultCount');
    if (contador) {
      contador.textContent = ativo
        ? `${visiveis} aula${visiveis === 1 ? '' : 's'} exibida${visiveis === 1 ? '' : 's'}`
        : '';
    }

    const vazio = porId('gradeEmptyState');
    if (vazio) vazio.classList.toggle('hidden', !ativo || visiveis > 0);

    todos('[data-filter]').forEach((botao) => {
      const selecionado = botao.dataset.filter === estado.filtro;
      botao.classList.toggle('is-active', selecionado);
      botao.setAttribute('aria-pressed', String(selecionado));
    });
  }

  function definirFiltro(filtro) {
    estado.filtro = filtro;
    aplicarFiltros();
  }

  function definirModo(modo) {
    estado.modo = modo;
    if (modo === 'dia' && !estado.diaFoco) estado.diaFoco = isoData(new Date());
    porId('viewWeekButton')?.classList.toggle('bg-senai-mist', modo === 'semana');
    porId('viewWeekButton')?.classList.toggle('text-slate-500', modo !== 'semana');
    porId('viewWeekButton')?.setAttribute('aria-pressed', String(modo === 'semana'));
    porId('viewDayButton')?.classList.toggle('bg-senai-mist', modo === 'dia');
    porId('viewDayButton')?.classList.toggle('text-slate-500', modo !== 'dia');
    porId('viewDayButton')?.setAttribute('aria-pressed', String(modo === 'dia'));
    pintarPeriodo();
    renderizarGrade();
  }

  function alternarExpandir() {
    const grade = porId('grade');
    if (!grade) return;
    const expandida = grade.classList.toggle('is-expanded');
    document.body.classList.toggle('grade-expanded', expandida);
    const botao = porId('expandGradeButton');
    if (botao) {
      botao.title = expandida ? 'Sair da tela cheia' : 'Expandir grade';
      botao.setAttribute('aria-label', botao.title);
      const icone = botao.querySelector('i');
      if (icone) icone.className = `ph ${expandida ? 'ph-arrows-in' : 'ph-arrows-out'} text-[13px]`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Drawer de alocação                                                  */
  /* ------------------------------------------------------------------ */

  function dadosDoAlunoSelecionado() {
    return estado.alunos.find((aluno) => String(aluno.id) === String(porId('fieldStudent')?.value));
  }

  function salaSelecionada() {
    return estado.salas.find((sala) => String(sala.id) === String(porId('fieldRoom')?.value));
  }

  function instrutorSelecionado() {
    return estado.instrutores.find((instrutor) => String(instrutor.id) === String(porId('fieldInstructor')?.value));
  }

  function dataSelecionada() {
    const chave = porId('fieldDay')?.value;
    const mapa = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4 };
    if (!chave || mapa[chave] === undefined) return null;
    return isoData(adicionarDias(estado.semanaInicio, mapa[chave]));
  }

  function popularAlunos() {
    const select = porId('fieldStudent');
    if (!select) return;
    const valor = select.value;
    const alunos = estado.alunos.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    select.innerHTML = alunos.length
      ? alunos.map((aluno) => `<option value="${aluno.id}">${escapar(aluno.nome)} - ${escapar(aluno.curso)}</option>`).join('')
      : '<option value="">Nenhum aluno cadastrado</option>';
    if (valor) select.value = valor;
  }

  function popularSalas() {
    const select = porId('fieldRoom');
    if (!select) return;
    const valor = select.value;
    const salas = estado.salas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    select.innerHTML = salas.length
      ? salas.map((sala) => {
        const tipo = sala.tipo === 'lab' ? 'Laboratório' : 'Sala';
        return `<option value="${sala.id}">${escapar(sala.nome)} - ${tipo} · ${escapar(sala.bloco)}, ${escapar(sala.andar)}</option>`;
      }).join('')
      : '<option value="">Nenhum espaço cadastrado</option>';
    if (valor) select.value = valor;
  }

  function popularInstrutores() {
    const select = porId('fieldInstructor');
    if (!select) return;
    const valor = select.value;
    const instrutores = estado.instrutores.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    select.innerHTML = instrutores.length
      ? instrutores.map((instrutor) => `<option value="${instrutor.id}">${escapar(instrutor.nome)}</option>`).join('')
      : '<option value="">Nenhum instrutor cadastrado</option>';
    if (valor) select.value = valor;
  }

  function popularHorarios() {
    const inicio = porId('fieldStart');
    const fim = porId('fieldEnd');
    if (!inicio || !fim) return;
    const opcoes = OPCOES_HORARIO.map((hora) => `<option value="${hora}">${hora}</option>`).join('');
    if (!inicio.options.length) inicio.innerHTML = opcoes;
    if (!fim.options.length) fim.innerHTML = opcoes;
  }

  function atualizarRotulosDia() {
    const select = porId('fieldDay');
    if (!select) return;
    const mapa = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4 };
    Array.from(select.options).forEach((opcao) => {
      const indice = mapa[opcao.value];
      if (indice === undefined) return;
      const data = adicionarDias(estado.semanaInicio, indice);
      opcao.textContent = `${NOMES_DIA[opcao.value]} · ${data.getDate()}`;
    });
  }

  function atualizarConflitoFormulario() {
    const aviso = porId('roomConflictWarning');
    if (!aviso) return;
    const dataISO = dataSelecionada();
    const inicio = porId('fieldStart')?.value || '08:00';
    const fim = porId('fieldEnd')?.value || somarMinutos(inicio, 90);
    const sala = salaSelecionada();
    const instrutor = instrutorSelecionado();
    const conflitos = [];

    if (dataISO && minutos(fim) > minutos(inicio)) {
      estado.aulasSemana.forEach((dia) => {
        if (dia.data !== dataISO) return;
        (dia.aulas || []).forEach((aula) => {
          if (estado.editando && aula.id === estado.editando.id) return;
          if (!sobrepoe(inicio, fim, aula.inicio, aula.fim)) return;
          if (sala && aula.sala === sala.nome) {
            conflitos.push(`Sala ocupada por ${aula.titulo}`);
          }
          if (instrutor && aula.instrutor === instrutor.nome) {
            conflitos.push(`Instrutor em ${aula.titulo}`);
          }
        });
      });
    }

    estado.conflitoFormulario = conflitos.length ? conflitos[0] : null;

    if (conflitos.length) {
      aviso.classList.remove('hidden');
      aviso.innerHTML = `<span class="inline-flex items-start gap-1.5"><i class="ph-fill ph-warning-circle mt-0.5 text-[12px]"></i><span>Atenção: Horário já ocupado. ${escapar(conflitos[0])}.</span></span>`;
    } else {
      aviso.classList.add('hidden');
      aviso.innerHTML = '';
    }
  }

  function ajustarFim() {
    const inicio = porId('fieldStart')?.value;
    const fim = porId('fieldEnd');
    if (!inicio || !fim) return;
    if (minutos(fim.value) <= minutos(inicio)) {
      fim.value = somarMinutos(inicio, 90);
    }
    atualizarConflitoFormulario();
  }

  function limparFormularioAlocacao() {
    const form = porId('allocationForm');
    if (form) form.reset();
    const notify = porId('notifyStudents');
    if (notify) notify.checked = true;
    if (porId('formFeedback')) {
      porId('formFeedback').className = 'mt-4 hidden rounded-xl border p-3.5';
      porId('formFeedback').innerHTML = '';
    }
    if (porId('roomConflictWarning')) {
      porId('roomConflictWarning').classList.add('hidden');
      porId('roomConflictWarning').innerHTML = '';
    }
    if (porId('newInstructorForm')) porId('newInstructorForm').classList.add('hidden');
  }

  function abrirDrawer(preset = {}) {
    const drawer = porId('drawer');
    if (!drawer) return;

    estado.editando = preset.aula || null;
    limparFormularioAlocacao();
    popularAlunos();
    popularSalas();
    popularInstrutores();
    popularHorarios();
    atualizarRotulosDia();

    const aula = preset.aula;
    const editing = Boolean(aula);

    if (porId('drawerTitle')) porId('drawerTitle').textContent = editing ? 'Editar alocação' : 'Nova alocação';
    if (porId('drawerEyebrow')) porId('drawerEyebrow').textContent = editing ? 'Gerenciamento' : 'Planejamento';
    if (porId('drawerSubtitle')) {
      porId('drawerSubtitle').textContent = editing
        ? 'Ajuste os dados e confirme a atualização.'
        : 'Preencha os dados e confirme a alocação.';
    }
    if (porId('saveAllocation')) porId('saveAllocation').textContent = editing ? 'Salvar alterações' : 'Salvar alocação';
    if (porId('deleteAllocation')) porId('deleteAllocation').classList.toggle('hidden', !editing);

    const dataISO = aula?.id ? (preset.dataISO || estado.diaFoco) : (preset.dataISO || null);
    if (dataISO) {
      const chave = chaveDoDia(dataISO);
      const dentroDaSemana = chave !== 'sab' && chave !== 'dom';
      if (dentroDaSemana && porId('fieldDay')) porId('fieldDay').value = chave;
      if (porId('weekDatePicker')) porId('weekDatePicker').value = dataISO;
    } else if (preset.day && porId('fieldDay')) {
      porId('fieldDay').value = preset.day;
    }

    if (aula) {
      const alunoId = aula.alunoId ?? aula.aluno_id;
      const salaId = aula.salaId ?? aula.sala_id;
      const instrutorId = aula.instrutorId ?? aula.instrutor_id;
      if (porId('fieldStudent') && alunoId) porId('fieldStudent').value = String(alunoId);
      if (porId('fieldDiscipline')) porId('fieldDiscipline').value = aula.titulo || '';
      if (porId('fieldNotes')) porId('fieldNotes').value = aula.subtitulo || '';
      if (porId('fieldType')) porId('fieldType').value = aula.tipo || 'teórica';
      if (porId('fieldRoom') && salaId) porId('fieldRoom').value = String(salaId);
      if (porId('fieldInstructor') && instrutorId) porId('fieldInstructor').value = String(instrutorId);
      if (porId('fieldStart')) porId('fieldStart').value = aula.inicio.slice(0, 5);
      if (porId('fieldEnd')) porId('fieldEnd').value = aula.fim.slice(0, 5);
      if (porId('notifyStudents')) porId('notifyStudents').checked = false;
    } else {
      const hora = preset.time || '08:00';
      if (porId('fieldStart')) porId('fieldStart').value = hora;
      if (porId('fieldEnd')) porId('fieldEnd').value = somarMinutos(hora, 90);
      if (preset.room && porId('fieldRoom')) {
        const sala = estado.salas.find((item) => item.nome === preset.room || String(item.id) === String(preset.room));
        if (sala) porId('fieldRoom').value = String(sala.id);
      }
      if (preset.discipline && porId('fieldDiscipline')) porId('fieldDiscipline').value = preset.discipline;
    }

    atualizarConflitoFormulario();
    drawer.inert = false;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    setTimeout(() => porId('fieldDiscipline')?.focus(), 280);
  }

  function fecharDrawer() {
    const drawer = porId('drawer');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    estado.editando = null;
  }

  function exibirFeedbackFormulario(tipo, titulo, texto) {
    const feedback = porId('formFeedback');
    if (!feedback) return;
    const estilos = {
      success: { box: 'border-emerald-200 bg-emerald-50', icon: 'ph-check-circle text-emerald-600', title: 'text-emerald-800', copy: 'text-emerald-700/80' },
      error: { box: 'border-red-200 bg-red-50', icon: 'ph-x-circle text-red-500', title: 'text-red-800', copy: 'text-red-600/80' },
      warning: { box: 'border-senai-orange/20 bg-senai-orange/[0.06]', icon: 'ph-warning-circle text-senai-orange', title: 'text-[#8A370D]', copy: 'text-[#8A370D]/70' }
    };
    const estilo = estilos[tipo] || estilos.warning;

    feedback.className = `mt-4 rounded-xl border p-3.5 ${estilo.box}`;
    feedback.innerHTML = `
      <div class="flex gap-2.5">
        <i class="ph-fill ${estilo.icon} mt-0.5 shrink-0 text-[15px]"></i>
        <div>
          <p class="text-[9.5px] font-semibold ${estilo.title}">${escapar(titulo)}</p>
          <p class="mt-1 text-[9.5px] leading-relaxed ${estilo.copy}">${escapar(texto)}</p>
        </div>
      </div>`;
  }

  function validarAlocacao(payload, aluno, sala, instrutor) {
    if (!aluno) return { titulo: 'Aluno obrigatório', texto: 'Selecione o aluno ou a turma que receberá a aula.' };
    if (!sala) return { titulo: 'Sala obrigatória', texto: 'Selecione a sala ou o laboratório da alocação.' };
    if (!instrutor) return { titulo: 'Instrutor obrigatório', texto: 'Selecione o instrutor responsável.' };
    if (!payload.titulo || payload.titulo.trim().length < 2) {
      return { titulo: 'Atividade obrigatória', texto: 'Informe a disciplina ou a atividade da aula.' };
    }
    if (minutos(payload.fim) <= minutos(payload.inicio)) {
      return { titulo: 'Horário inválido', texto: 'O término precisa ser depois do início.' };
    }

    const choque = [];
    estado.aulasSemana.forEach((dia) => {
      if (dia.data !== payload.data) return;
      (dia.aulas || []).forEach((aula) => {
        if (estado.editando && aula.id === estado.editando.id) return;
        if (!sobrepoe(payload.inicio, payload.fim, aula.inicio, aula.fim)) return;
        if (aula.sala === sala.nome) {
          choque.push(`A ${sala.nome} já está com ${aula.titulo} (${aula.inicio}-${aula.fim}).`);
        }
        if (aula.instrutor === instrutor.nome) {
          choque.push(`${instrutor.nome} já está em ${aula.titulo} (${aula.inicio}-${aula.fim}).`);
        }
      });
    });

    if (choque.length) {
      return { titulo: 'Conflito de horário', texto: choque[0] };
    }

    if (sala.tipo !== 'lab' && payload.tipo === 'prática' && /clp|soldagem/i.test(payload.titulo)) {
      return { titulo: 'Regra de infraestrutura', texto: 'Essa prática exige laboratório. Selecione um Lab compatível.' };
    }

    return null;
  }

  async function salvarAlocacao(evento) {
    evento.preventDefault();

    const editando = Boolean(estado.editando);
    const aluno = dadosDoAlunoSelecionado();
    const sala = salaSelecionada();
    const instrutor = instrutorSelecionado();
    const dataISO = dataSelecionada();
    const inicio = porId('fieldStart')?.value;
    const fim = porId('fieldEnd')?.value;
    const botao = porId('saveAllocation');

    const payload = {
      alunoId: aluno?.id,
      salaId: sala?.id,
      instrutorId: instrutor?.id,
      data: dataISO,
      inicio,
      fim,
      titulo: porId('fieldDiscipline')?.value.trim() || '',
      subtitulo: porId('fieldNotes')?.value.trim() || '',
      tipo: porId('fieldType')?.value || 'teórica',
      notificar: Boolean(porId('notifyStudents')?.checked)
    };

    const erro = validarAlocacao(payload, aluno, sala, instrutor);
    if (erro) {
      exibirFeedbackFormulario('error', erro.titulo, erro.texto);
      mostrarToast('warning', erro.titulo, erro.texto);
      return;
    }

    if (botao) {
      botao.disabled = true;
      botao.textContent = editando ? 'Salvando...' : 'Alocando...';
    }

    try {
      if (editando) {
        await API.requisitar(`/dashboard/aulas/${encodeURIComponent(estado.editando.id)}`, {
          metodo: 'PATCH',
          corpo: payload
        });
      } else {
        await API.requisitar('/dashboard/aulas', {
          metodo: 'POST',
          corpo: payload
        });
      }

      const mensagem = `${payload.titulo} · ${sala.nome} · ${nomeDoDia(payload.data)} às ${payload.inicio}.`;
      fecharDrawer();
      mostrarToast('success', editando ? 'Alocação atualizada' : 'Alocação concluída', mensagem);
      await atualizar();
    } catch (erroAPI) {
      if (erroAPI instanceof API.ErroSessao) return;
      const detalhe = erroAPI.detail;
      const mensagem = API.mensagemDeErro(erroAPI);
      const titulo = detalhe && typeof detalhe === 'object' && detalhe.tipo
        ? `Conflito de ${detalhe.tipo}`
        : 'Não foi possível salvar';
      exibirFeedbackFormulario('error', titulo, mensagem);
      mostrarToast('warning', titulo, mensagem);
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.textContent = editando ? 'Salvar alterações' : 'Salvar alocação';
      }
    }
  }

  async function excluirAlocacao() {
    if (!estado.editando) return;
    const aula = estado.editando;
    const confirmar = window.confirm(`Excluir a alocação "${aula.titulo}"? Esta ação não pode ser desfeita.`);
    if (!confirmar) return;

    const notificar = Boolean(porId('notifyStudents')?.checked);
    try {
      await API.requisitar(`/dashboard/aulas/${encodeURIComponent(aula.id)}?notificar=${notificar ? 'true' : 'false'}`, {
        metodo: 'DELETE'
      });
      fecharDrawer();
      mostrarToast('success', 'Alocação excluída', 'A grade foi atualizada.');
      await atualizar();
    } catch (erroAPI) {
      if (erroAPI instanceof API.ErroSessao) return;
      const mensagem = API.mensagemDeErro(erroAPI);
      exibirFeedbackFormulario('error', 'Não foi possível excluir', mensagem);
      mostrarToast('warning', 'Não foi possível excluir', mensagem);
    }
  }

  async function cadastrarInstrutor() {
    const nome = porId('newInstructorName')?.value.trim() || '';
    let iniciais = porId('newInstructorInitials')?.value.trim().toUpperCase() || '';

    if (nome.length < 2) {
      mostrarToast('warning', 'Nome obrigatório', 'Informe ao menos 2 caracteres para o instrutor.');
      porId('newInstructorName')?.focus();
      return;
    }
    if (!iniciais) {
      iniciais = nome.split(/\s+/).map((parte) => parte[0] || '').join('').slice(0, 2).toUpperCase();
    }

    const botao = porId('saveInstructor');
    if (botao) {
      botao.disabled = true;
      botao.textContent = 'Cadastrando...';
    }

    try {
      const criado = await API.requisitar('/dashboard/instrutores', {
        metodo: 'POST',
        corpo: { nome, iniciais }
      });
      estado.instrutores.push(criado);
      popularInstrutores();
      if (porId('fieldInstructor')) porId('fieldInstructor').value = String(criado.id);
      if (porId('newInstructorForm')) porId('newInstructorForm').classList.add('hidden');
      if (porId('newInstructorName')) porId('newInstructorName').value = '';
      if (porId('newInstructorInitials')) porId('newInstructorInitials').value = '';
      atualizarConflitoFormulario();
      mostrarToast('success', 'Instrutor cadastrado', `${criado.nome} já está disponível para alocação.`);
    } catch (erroAPI) {
      if (erroAPI instanceof API.ErroSessao) return;
      mostrarToast('warning', 'Não foi possível cadastrar', API.mensagemDeErro(erroAPI));
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.textContent = 'Cadastrar';
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Central de avisos                                                   */
  /* ------------------------------------------------------------------ */

  function abrirCentralAvisos() {
    const modal = porId('noticesModal');
    if (!modal) return;
    estado.avisoEditando = null;
    estado.avisoBusca = '';
    if (porId('noticeSearch')) porId('noticeSearch').value = '';
    modal.classList.remove('hidden');
    porId('noticesListView')?.classList.remove('hidden');
    porId('noticeEditorView')?.classList.add('hidden');
    renderizarAvisosAdmin();
    porId('noticeSearch')?.focus();
  }

  function fecharCentralAvisos() {
    porId('noticesModal')?.classList.add('hidden');
    estado.avisoEditando = null;
  }

  function renderizarAvisosAdmin() {
    const lista = porId('noticesAdminList');
    if (!lista) return;

    const termo = normalizar(porId('noticeSearch')?.value || estado.avisoBusca || '');
    const tipo = porId('noticeTypeFilter')?.value || 'todos';
    const avisos = estado.avisos.filter((aviso) => {
      if (tipo !== 'todos' && aviso.tipo !== tipo) return false;
      if (!termo) return true;
      return normalizar(`${aviso.titulo} ${aviso.texto} ${aviso.destinatario}`).includes(termo);
    });

    if (porId('noticesAdminCount')) {
      porId('noticesAdminCount').textContent = `${avisos.length} aviso${avisos.length === 1 ? '' : 's'} listado${avisos.length === 1 ? '' : 's'}`;
    }

    if (!avisos.length) {
      lista.innerHTML = `
        <div class="py-10 text-center">
          <i class="ph ph-megaphone text-[28px] text-slate-300"></i>
          <p class="mt-2 text-[10.5px] font-semibold text-senai-dark">Nenhum aviso encontrado</p>
          <p class="mt-1 text-[9.5px] text-slate-500">Publique um novo comunicado para os alunos.</p>
        </div>`;
      return;
    }

    lista.innerHTML = avisos.map((aviso) => `
      <div class="border-b border-slate-100 py-3 last:border-0">
        <div class="flex items-start justify-between gap-3">
          <button type="button" data-ver-aviso="${escapar(aviso.id)}" class="min-w-0 flex-1 text-left">
            <span class="flex flex-wrap items-center gap-1.5">
              <span class="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-600">${escapar(ROTULOS_AVISO[aviso.tipo] || aviso.tipo)}</span>
              <span class="text-[9px] text-slate-400">${escapar(tempoRelativo(aviso.quando))}</span>
            </span>
            <span class="mt-1 block truncate text-[10.5px] font-semibold text-senai-dark">${escapar(aviso.titulo)}</span>
            <span class="mt-0.5 block text-[9.5px] leading-relaxed text-slate-500">${escapar(aviso.texto.length > 120 ? `${aviso.texto.slice(0, 117)}...` : aviso.texto)}</span>
            <span class="mt-1 block text-[9px] text-slate-400">Para: ${escapar(aviso.destinatario)} · Publicado em ${escapar(new Date(aviso.quando).toLocaleDateString('pt-BR'))}</span>
          </button>
          <span class="flex shrink-0 gap-1">
            <button type="button" data-editar-aviso="${escapar(aviso.id)}" aria-label="Editar aviso" title="Editar" class="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-senai-dark"><i class="ph ph-pencil-simple text-[12px]"></i></button>
            <button type="button" data-excluir-aviso="${escapar(aviso.id)}" aria-label="Excluir aviso" title="Excluir" class="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"><i class="ph ph-trash text-[12px]"></i></button>
          </span>
        </div>
      </div>`).join('');
  }

  function popularDestinatarios(aviso) {
    const select = porId('noticeRecipient');
    if (!select) return;
    select.innerHTML = '<option value="">Todos os alunos</option>' + estado.alunos
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((aluno) => `<option value="${aluno.id}">${escapar(aluno.nome)} - ${escapar(aluno.matricula)}</option>`)
      .join('');
    select.value = aviso && aviso.aluno_id ? String(aviso.aluno_id) : '';
    select.disabled = Boolean(aviso);
  }

  function abrirEditorAviso(aviso) {
    estado.avisoEditando = aviso || null;
    porId('noticesListView')?.classList.add('hidden');
    porId('noticeEditorView')?.classList.remove('hidden');

    if (porId('noticeFormTitle')) porId('noticeFormTitle').textContent = aviso ? 'Editar aviso' : 'Novo aviso';
    if (porId('saveNotice')) porId('saveNotice').textContent = aviso ? 'Salvar alterações' : 'Publicar aviso';
    if (porId('noticeTitle')) porId('noticeTitle').value = aviso?.titulo || '';
    if (porId('noticeText')) porId('noticeText').value = aviso?.texto || '';
    if (porId('noticeType')) porId('noticeType').value = aviso?.tipo || 'sistema';
    if (porId('noticePush')) porId('noticePush').checked = true;
    if (porId('noticeFormFeedback')) porId('noticeFormFeedback').className = 'mt-3 hidden rounded-xl border p-3 text-[9.5px]';

    popularDestinatarios(aviso);
    porId('noticeTitle')?.focus();
  }

  async function salvarAviso(evento) {
    evento.preventDefault();
    const aviso = estado.avisoEditando;
    const titulo = porId('noticeTitle')?.value.trim() || '';
    const texto = porId('noticeText')?.value.trim() || '';
    const tipo = porId('noticeType')?.value || 'sistema';
    const destinatario = porId('noticeRecipient')?.value || '';
    const push = Boolean(porId('noticePush')?.checked);
    const feedback = porId('noticeFormFeedback');
    const botao = porId('saveNotice');

    const exibir = (mensagem, erro) => {
      if (!feedback) return;
      feedback.className = `mt-3 rounded-xl border p-3 text-[9.5px] ${erro ? 'border-red-200 bg-red-50 text-red-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`;
      feedback.textContent = mensagem;
    };

    if (titulo.length < 3 || texto.length < 3) {
      exibir('Título e mensagem precisam ter ao menos 3 caracteres.', true);
      return;
    }

    if (botao) {
      botao.disabled = true;
      botao.textContent = 'Salvando...';
    }

    try {
      if (aviso) {
        await API.requisitar(`/dashboard/avisos/${encodeURIComponent(aviso.id)}`, {
          metodo: 'PATCH',
          corpo: { titulo, texto, tipo }
        });
      } else {
        await API.requisitar('/dashboard/avisos', {
          metodo: 'POST',
          corpo: {
            titulo,
            texto,
            tipo,
            alunoId: destinatario ? Number(destinatario) : null,
            enviarPush: push
          }
        });
      }

      estado.avisoEditando = null;
      porId('noticesListView')?.classList.remove('hidden');
      porId('noticeEditorView')?.classList.add('hidden');
      mostrarToast('success', aviso ? 'Aviso atualizado' : 'Aviso publicado', 'A agenda dos alunos foi sincronizada.');
      await atualizar();
      renderizarAvisosAdmin();
    } catch (erroAPI) {
      if (erroAPI instanceof API.ErroSessao) return;
      exibir(API.mensagemDeErro(erroAPI), true);
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.textContent = estado.avisoEditando ? 'Salvar alterações' : 'Publicar aviso';
      }
    }
  }

  async function excluirAviso(id) {
    const aviso = estado.avisos.find((item) => String(item.id) === String(id));
    if (!aviso) return;
    const confirmar = window.confirm(`Excluir o aviso "${aviso.titulo}"? Ele também sairá da agenda dos alunos.`);
    if (!confirmar) return;

    try {
      await API.requisitar(`/dashboard/avisos/${encodeURIComponent(aviso.id)}`, { metodo: 'DELETE' });
      mostrarToast('success', 'Aviso excluído', 'O comunicado saiu da agenda dos alunos.');
      await atualizar();
      renderizarAvisosAdmin();
    } catch (erroAPI) {
      if (erroAPI instanceof API.ErroSessao) return;
      mostrarToast('warning', 'Não foi possível excluir', API.mensagemDeErro(erroAPI));
    }
  }

  function abrirDetalheAviso(id) {
    const aviso = estado.avisos.find((item) => String(item.id) === String(id));
    if (!aviso) return;
    abrirInfo(aviso.titulo, `${ROTULOS_AVISO[aviso.tipo] || 'Aviso'} · ${new Date(aviso.quando).toLocaleString('pt-BR')}`, `
      <p class="text-[10.5px] leading-relaxed text-slate-600">${escapar(aviso.texto)}</p>
      <div class="mt-4 rounded-xl bg-slate-50 p-3 text-[9.5px] text-slate-500">
        <p><span class="font-semibold text-senai-dark">Destinatário:</span> ${escapar(aviso.destinatario)}</p>
        <p class="mt-1"><span class="font-semibold text-senai-dark">Tipo:</span> ${escapar(ROTULOS_AVISO[aviso.tipo] || aviso.tipo)}</p>
      </div>`);
  }

  /* ------------------------------------------------------------------ */
  /* Painel de avisos recentes (card)                                    */
  /* ------------------------------------------------------------------ */

  function pintarAvisosRecentes(avisos) {
    const lista = porId('noticesList');
    const contador = porId('sidebarNoticeCount');

    if (contador) contador.textContent = avisos.length;
    if (!lista) return;

    if (!avisos.length) {
      lista.innerHTML = `
        <div class="px-1 py-7 text-center">
          <i class="ph ph-megaphone text-[24px] text-slate-300"></i>
          <p class="mt-2 text-[12px] font-semibold text-senai-dark">Nenhum aviso publicado</p>
          <p class="secao-subtitulo mt-1">Os comunicados enviados aos alunos aparecem aqui.</p>
        </div>`;
      return;
    }

    lista.innerHTML = avisos.slice(0, 5).map((aviso) => {
      const cor = CORES_AVISO[aviso.tipo] || CORES_AVISO.sistema;
      return `
        <button type="button" data-aviso-card="${escapar(aviso.id)}" class="aviso-item group">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${cor}"></span>
          <span class="min-w-0 flex-1">
            <span class="aviso-titulo">${escapar(aviso.titulo)}</span>
            <span class="aviso-texto">${escapar(aviso.texto.length > 90 ? `${aviso.texto.slice(0, 87)}...` : aviso.texto)}</span>
            <span class="aviso-destino"><i class="ph ph-user text-[11px]"></i>Para: ${escapar(aviso.destinatario)}</span>
          </span>
          <span class="aviso-hora">${escapar(tempoRelativo(aviso.quando))}</span>
        </button>`;
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Dados                                                               */
  /* ------------------------------------------------------------------ */

  function sincronizarEstadoGlobal() {
    window.GestorDashboard = {
      estado,
      semanaInicio: estado.semanaInicio,
      aulasSemana: estado.aulasSemana,
      salas: estado.salas,
      alunos: estado.alunos,
      instrutores: estado.instrutores,
      atualizar,
      abrirDrawer
    };
  }

  async function carregarCadastros() {
    const [salas, alunos, instrutores] = await Promise.allSettled([
      API.requisitar('/dashboard/salas'),
      API.requisitar('/dashboard/alunos'),
      API.requisitar('/dashboard/instrutores')
    ]);

    estado.salas = salas.status === 'fulfilled' ? salas.value || [] : [];
    estado.alunos = alunos.status === 'fulfilled' ? alunos.value || [] : [];
    estado.instrutores = instrutores.status === 'fulfilled' ? instrutores.value || [] : [];

    popularAlunos();
    popularSalas();
    popularInstrutores();
    sincronizarEstadoGlobal();
  }

  async function atualizar(opcoes = {}) {
    const { silencioso = false } = opcoes;
    if (estado.carregando) return false;
    estado.carregando = true;
    const tabela = porId('gradeTable');
    if (tabela) tabela.style.opacity = '0.55';

    try {
      const inicioISO = isoData(estado.semanaInicio);
      const fimISO = isoData(adicionarDias(estado.semanaInicio, 4));

      const [resumo, conflitos, avisos, grade] = await Promise.all([
        API.requisitar('/dashboard/resumo'),
        API.requisitar(`/dashboard/conflitos?inicio=${inicioISO}&fim=${fimISO}`),
        API.requisitar('/dashboard/avisos?limite=200'),
        API.requisitar(`/dashboard/grade?inicio=${inicioISO}&fim=${fimISO}`)
      ]);

      estado.aulasSemana = grade?.dias || [];
      estado.resumo = resumo;
      estado.conflitos = conflitos || [];
      estado.avisos = avisos || [];

      pintarResumo(resumo);
      pintarConflitos(estado.conflitos);
      pintarAvisosRecentes(estado.avisos);
      pintarPeriodo();
      renderizarGrade();
      renderizarNotificacoes();
      sincronizarEstadoGlobal();

      const picker = porId('weekDatePicker');
      if (picker) picker.value = estado.diaFoco;
      pintarConexao(true);
      return true;
    } catch (erro) {
      if (erro instanceof API.ErroSessao) return false;
      console.error('[Gestor SENAI] Falha ao sincronizar o painel', erro);
      pintarConexao(false, API.mensagemDeErro(erro));
      if (!silencioso) {
        mostrarToast('warning', 'Não foi possível sincronizar', API.mensagemDeErro(erro));
      }
      return false;
    } finally {
      estado.carregando = false;
      if (tabela) tabela.style.opacity = '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */

  function configurarEventos() {
    // Sidebar
    const abrirSidebar = () => {
      porId('sidebar')?.classList.remove('-translate-x-full');
      porId('sidebarOverlay')?.classList.remove('hidden');
    };
    const fecharSidebar = () => {
      porId('sidebar')?.classList.add('-translate-x-full');
      porId('sidebarOverlay')?.classList.add('hidden');
    };

    porId('openSidebar')?.addEventListener('click', abrirSidebar);
    porId('closeSidebar')?.addEventListener('click', fecharSidebar);
    porId('sidebarOverlay')?.addEventListener('click', fecharSidebar);
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) porId('sidebarOverlay')?.classList.add('hidden');
    });
    todos('[data-nav-link]').forEach((link) => {
      link.addEventListener('click', () => {
        todos('[data-nav-link]').forEach((outro) => outro.classList.remove('is-active'));
        link.classList.add('is-active');
        if (window.innerWidth < 1024) fecharSidebar();
      });
    });

    // Toast
    porId('closeDashToast')?.addEventListener('click', fecharToast);

    // Logout
    const sair = () => API.sair();
    porId('logoutBtn')?.addEventListener('click', sair);
    porId('sidebarLogout')?.addEventListener('click', sair);

    // Perfil
    porId('profileButton')?.addEventListener('click', alternarMenuPerfil);
    todos('[data-profile-action]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const acao = botao.dataset.profileAction;
        if (acao === 'sair') {
          API.sair();
          return;
        }
        if (acao === 'config') {
          abrirPreferencias();
          return;
        }
        abrirPerfil();
      });
    });

    // Sino
    porId('bellButton')?.addEventListener('click', alternarSino);
    porId('bellClose')?.addEventListener('click', fecharSino);
    porId('bellMarkAll')?.addEventListener('click', marcarTodasLidas);
    porId('bellSeeAll')?.addEventListener('click', () => {
      fecharSino();
      abrirCentralAvisos();
    });

    porId('bellList')?.addEventListener('click', (evento) => {
      const marcar = evento.target.closest('[data-marcar-lida]');
      if (marcar) {
        evento.stopPropagation();
        marcarLida(marcar.dataset.marcarLida);
        return;
      }
      const item = evento.target.closest('[data-notificacao]');
      if (item) abrirNotificacao(item.dataset.notificacao);
    });

    // Busca
    const entradaBusca = porId('globalSearch');
    entradaBusca?.addEventListener('input', () => {
      estado.busca = entradaBusca.value;
      renderizarResultadosBusca();
      aplicarFiltros();
    });
    entradaBusca?.addEventListener('focus', () => {
      if (entradaBusca.value.trim()) renderizarResultadosBusca();
    });
    entradaBusca?.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        moverSelecaoBusca(1);
      } else if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        moverSelecaoBusca(-1);
      } else if (evento.key === 'Enter') {
        if (estado.indiceBusca >= 0) {
          evento.preventDefault();
          ativarResultado(estado.indiceBusca);
        }
      } else if (evento.key === 'Escape') {
        fecharResultadosBusca();
        entradaBusca.blur();
      }
    });
    entradaBusca?.addEventListener('blur', () => {
      setTimeout(fecharResultadosBusca, 140);
    });

    porId('searchResults')?.addEventListener('mousedown', (evento) => {
      evento.preventDefault();
    });
    porId('searchResults')?.addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-resultado]');
      if (botao) ativarResultado(Number(botao.dataset.resultado));
    });

    // Fechar popovers e menus
    document.addEventListener('click', (evento) => {
      if (!evento.target.closest('#profileButton') && !evento.target.closest('#profileMenu')) {
        fecharMenuPerfil();
      }
      if (!evento.target.closest('#bellButton') && !evento.target.closest('#bellPopover')) {
        fecharSino();
      }
      if (!evento.target.closest('#globalSearch') && !evento.target.closest('#searchResults')) {
        fecharResultadosBusca();
      }
    });

    // Filtros
    todos('[data-filter]').forEach((botao) => {
      botao.addEventListener('click', () => definirFiltro(botao.dataset.filter));
    });

    // Navegação da grade
    porId('viewWeekButton')?.addEventListener('click', () => definirModo('semana'));
    porId('viewDayButton')?.addEventListener('click', () => definirModo('dia'));
    porId('expandGradeButton')?.addEventListener('click', alternarExpandir);
    porId('prevPeriodButton')?.addEventListener('click', () => {
      if (estado.modo === 'dia') {
        estado.diaFoco = isoData(adicionarDias(dataDeISO(estado.diaFoco), -1));
        estado.semanaInicio = segundaDaSemana(dataDeISO(estado.diaFoco));
      } else {
        estado.semanaInicio = adicionarDias(estado.semanaInicio, -7);
        estado.diaFoco = isoData(adicionarDias(dataDeISO(estado.diaFoco), -7));
      }
      atualizar();
    });
    porId('nextPeriodButton')?.addEventListener('click', () => {
      if (estado.modo === 'dia') {
        estado.diaFoco = isoData(adicionarDias(dataDeISO(estado.diaFoco), 1));
        estado.semanaInicio = segundaDaSemana(dataDeISO(estado.diaFoco));
      } else {
        estado.semanaInicio = adicionarDias(estado.semanaInicio, 7);
        estado.diaFoco = isoData(adicionarDias(dataDeISO(estado.diaFoco), 7));
      }
      atualizar();
    });
    porId('todayButton')?.addEventListener('click', () => {
      estado.semanaInicio = segundaDaSemana(new Date());
      estado.diaFoco = isoData(new Date());
      atualizar();
      porId('grade')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    porId('weekDatePicker')?.addEventListener('change', (evento) => {
      const valor = evento.target.value;
      if (!valor) return;
      estado.diaFoco = valor;
      estado.semanaInicio = segundaDaSemana(dataDeISO(valor));
      atualizar();
    });

    // Cards de indicadores
    porId('cardOccupancy')?.addEventListener('click', abrirDetalheOcupacao);
    porId('cardLessons')?.addEventListener('click', abrirDetalheAulas);
    porId('cardConflicts')?.addEventListener('click', (evento) => {
      if (evento.target.closest('#resolveConflictMetric')) return;
      abrirListaConflitos();
    });
    porId('resolveConflictMetric')?.addEventListener('click', (evento) => {
      evento.stopPropagation();
      abrirListaConflitos();
    });
    ['cardOccupancy', 'cardLessons', 'cardConflicts'].forEach((id) => {
      porId(id)?.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          porId(id).click();
        }
      });
    });

    // Grade: clique em aula ou espaço vazio
    porId('gradeBody')?.addEventListener('click', (evento) => {
      const vazio = evento.target.closest('.empty-slot');
      if (vazio) {
        abrirDrawer({ dataISO: vazio.dataset.date, time: vazio.dataset.time });
        return;
      }
      const cartao = evento.target.closest('.schedule-block');
      if (cartao) {
        const aula = estado.aulasSemana
          .flatMap((dia) => (dia.aulas || []).map((item) => ({ ...item, dataISO: dia.data })))
          .find((item) => String(item.id) === String(cartao.dataset.aula));
        if (aula) abrirDrawer({ aula, dataISO: aula.dataISO });
      }
    });

    // Cards de aulas recentes e avisos
    porId('noticesList')?.addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-aviso-card]');
      if (botao) abrirDetalheAviso(botao.dataset.avisoCard);
    });
    porId('manageNotices')?.addEventListener('click', abrirCentralAvisos);

    // Drawer
    porId('newAllocation')?.addEventListener('click', () => abrirDrawer());
    todos('[data-close-drawer]').forEach((elemento) => elemento.addEventListener('click', fecharDrawer));
    porId('allocationForm')?.addEventListener('submit', salvarAlocacao);
    porId('deleteAllocation')?.addEventListener('click', excluirAlocacao);
    porId('fieldStart')?.addEventListener('change', ajustarFim);
    porId('fieldEnd')?.addEventListener('change', atualizarConflitoFormulario);
    porId('fieldDay')?.addEventListener('change', atualizarConflitoFormulario);
    porId('fieldRoom')?.addEventListener('change', atualizarConflitoFormulario);
    porId('fieldInstructor')?.addEventListener('change', atualizarConflitoFormulario);
    porId('newInstructorToggle')?.addEventListener('click', () => {
      porId('newInstructorForm')?.classList.toggle('hidden');
      porId('newInstructorName')?.focus();
    });
    porId('cancelInstructor')?.addEventListener('click', () => {
      porId('newInstructorForm')?.classList.add('hidden');
    });
    porId('saveInstructor')?.addEventListener('click', cadastrarInstrutor);

    // Central de avisos
    todos('[data-close-notices]').forEach((elemento) => elemento.addEventListener('click', fecharCentralAvisos));
    porId('newNotice')?.addEventListener('click', () => abrirEditorAviso(null));
    porId('cancelNotice')?.addEventListener('click', () => {
      estado.avisoEditando = null;
      porId('noticesListView')?.classList.remove('hidden');
      porId('noticeEditorView')?.classList.add('hidden');
    });
    porId('noticeForm')?.addEventListener('submit', salvarAviso);
    porId('noticeSearch')?.addEventListener('input', () => {
      estado.avisoBusca = porId('noticeSearch').value;
      renderizarAvisosAdmin();
    });
    porId('noticeTypeFilter')?.addEventListener('change', renderizarAvisosAdmin);
    porId('noticesAdminList')?.addEventListener('click', (evento) => {
      const editar = evento.target.closest('[data-editar-aviso]');
      if (editar) {
        abrirEditorAviso(estado.avisos.find((aviso) => String(aviso.id) === editar.dataset.editarAviso));
        return;
      }
      const excluir = evento.target.closest('[data-excluir-aviso]');
      if (excluir) {
        excluirAviso(excluir.dataset.excluirAviso);
        return;
      }
      const ver = evento.target.closest('[data-ver-aviso]');
      if (ver) abrirDetalheAviso(ver.dataset.verAviso);
    });

    // Modais genéricos
    todos('[data-close-info]').forEach((elemento) => elemento.addEventListener('click', fecharInfo));
    porId('infoModal')?.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-info-aula]')) {
        const aula = estado.aulasSemana
          .flatMap((dia) => (dia.aulas || []).map((item) => ({ ...item, dataISO: dia.data })))
          .find((item) => String(item.id) === evento.target.closest('[data-info-aula]').dataset.infoAula);
        if (aula) {
          fecharInfo();
          abrirDrawer({ aula, dataISO: aula.dataISO });
        }
        return;
      }
      const conflito = evento.target.closest('[data-ir-conflito]');
      if (conflito) irParaConflito(Number(conflito.dataset.irConflito));
    });

    // Escape fecha camadas na ordem correta
    document.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      const drawerAberto = porId('drawer')?.classList.contains('is-open');
      const infoAberto = !porId('infoModal')?.classList.contains('hidden');
      const avisosAberto = !porId('noticesModal')?.classList.contains('hidden');
      const gradeExpandida = porId('grade')?.classList.contains('is-expanded');

      if (avisosAberto) {
        fecharCentralAvisos();
      } else if (infoAberto) {
        fecharInfo();
      } else if (drawerAberto) {
        fecharDrawer();
      } else if (gradeExpandida) {
        alternarExpandir();
      } else {
        fecharMenuPerfil();
        fecharSino();
        fecharResultadosBusca();
      }
    });

    // Atalho de busca
    document.addEventListener('keydown', (evento) => {
      const tag = document.activeElement?.tagName;
      const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
      if (evento.key === '/' && !digitando) {
        evento.preventDefault();
        porId('globalSearch')?.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Início                                                              */
  /* ------------------------------------------------------------------ */

  async function iniciar() {
    configurarEventos();
    await carregarCadastros();

    try {
      const sessao = await API.requisitar('/auth/me');
      const usuario = sessao?.usuario;

      if (usuario?.papel !== 'coordenacao') {
        if (usuario?.papel === 'aluno') {
          window.location.replace('index.html');
        } else {
          window.location.replace('login.html?motivo=permissao');
        }
        return;
      }

      estado.usuario = usuario;
      pintarUsuario(usuario);
    } catch (erro) {
      if (erro instanceof API.ErroSessao) return;
      console.error('[Gestor SENAI] Falha ao confirmar a sessão', erro);
      mostrarToast('warning', 'Falha de conexão', API.mensagemDeErro(erro));
      return;
    }

    const picker = porId('weekDatePicker');
    if (picker) picker.value = estado.diaFoco;

    await atualizar();

    // Mantém os indicadores vivos sem recarregar a página.
    setInterval(() => {
      if (!document.hidden) atualizar({ silencioso: true });
    }, 30000);
  }

  iniciar();
})();
