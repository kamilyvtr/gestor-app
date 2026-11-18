from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..models import Aluno, AlteracaoSala, Aula, Aviso, Instrutor, Sala, Usuario
from ..schemas import (
    AlocacoesOut,
    AulaOut,
    AvisoCreateIn,
    AvisoPainelOut,
    DiaPainelOut,
    EventoMudancaOut,
    ResultadoPushOut,
    ResumoOut,
    SalaOut,
)
from ..serializers import (
    aluno_painel_para_out,
    aula_para_out,
    aula_painel_para_out,
    instrutor_para_out,
    sala_para_out,
)
from ..tempo import agora_utc
from .broker import broker
from .conflitos import aulas_no_periodo, buscar_conflito_sala, detectar_conflitos
from .push import (
    enviar_para_aluno,
    enviar_para_todos,
    payload_aviso,
    payload_mudanca_sala,
)


class ErroDeNegocio(Exception):
    """Regra de negócio violada; o router converte em HTTP 400/409."""


class SalaOcupadaError(ErroDeNegocio):
    def __init__(self, conflito: Aula) -> None:
        self.conflito = conflito
        super().__init__(
            f"A sala já está ocupada por {conflito.titulo} "
            f"({conflito.inicio:%H:%M}–{conflito.fim:%H:%M})."
        )


class InstrutorOcupadoError(ErroDeNegocio):
    def __init__(self, conflito: Aula) -> None:
        self.conflito = conflito
        super().__init__(
            f"O instrutor já tem {conflito.titulo} "
            f"({conflito.inicio:%H:%M}–{conflito.fim:%H:%M})."
        )


def _buscar_conflito(
    db: Session,
    *,
    data: date,
    inicio: time,
    fim: time,
    sala_id: int | None = None,
    instrutor_id: int | None = None,
    ignorar_aula_id: str | None = None,
) -> Aula | None:
    condicoes = [
        Aula.data == data,
        Aula.inicio < fim,
        Aula.fim > inicio,
    ]
    if ignorar_aula_id:
        condicoes.append(Aula.id != ignorar_aula_id)
    if sala_id is not None:
        condicoes.append(Aula.sala_id == sala_id)
    if instrutor_id is not None:
        condicoes.append(Aula.instrutor_id == instrutor_id)

    return db.scalar(
        select(Aula)
        .where(*condicoes)
        .options(joinedload(Aula.sala), joinedload(Aula.instrutor))
        .order_by(Aula.inicio)
        .limit(1)
    )


def criar_aula(
    db: Session,
    *,
    aluno_id: int,
    sala_id: int,
    instrutor_id: int,
    data: date,
    inicio: time,
    fim: time,
    titulo: str,
    subtitulo: str = "",
    tipo: str = "teórica",
    aula_id: str | None = None,
) -> Aula:
    aluno = db.get(Aluno, aluno_id)
    sala = db.get(Sala, sala_id)
    instrutor = db.get(Instrutor, instrutor_id)
    if not aluno:
        raise LookupError("Aluno não encontrado.")
    if not sala:
        raise LookupError("Sala não encontrada.")
    if not instrutor:
        raise LookupError("Instrutor não encontrado.")
    if fim <= inicio:
        raise ErroDeNegocio("O horário final precisa ser depois do inicial.")

    conflito_sala = _buscar_conflito(
        db, data=data, inicio=inicio, fim=fim, sala_id=sala_id
    )
    if conflito_sala:
        raise SalaOcupadaError(conflito_sala)

    conflito_instrutor = _buscar_conflito(
        db, data=data, inicio=inicio, fim=fim, instrutor_id=instrutor_id
    )
    if conflito_instrutor:
        raise InstrutorOcupadoError(conflito_instrutor)

    aula = Aula(
        id=aula_id or f"aula-{uuid4().hex[:10]}",
        aluno_id=aluno.id,
        sala_id=sala.id,
        instrutor_id=instrutor.id,
        data=data,
        inicio=inicio,
        fim=fim,
        titulo=titulo,
        subtitulo=subtitulo,
        tipo=tipo,
        direcoes=sala.direcoes,
    )
    db.add(aula)
    db.commit()
    db.refresh(aula)
    return aula


def mudar_sala(
    db: Session,
    *,
    aula_id: str,
    nova_sala_id: int,
    mensagem: str | None = None,
) -> tuple[Aula, Aviso, EventoMudancaOut, ResultadoPushOut]:
    aula = db.get(Aula, aula_id)
    if not aula:
        raise LookupError("Aula não encontrada.")
    nova_sala = db.get(Sala, nova_sala_id)
    if not nova_sala:
        raise LookupError("Sala de destino não encontrada.")
    if aula.sala_id == nova_sala.id:
        raise ErroDeNegocio("A aula já está nessa sala.")

    conflito = buscar_conflito_sala(db, aula, nova_sala.id)
    if conflito:
        raise SalaOcupadaError(conflito)

    sala_anterior = aula.sala
    aula.sala = nova_sala
    aula.sala_anterior = sala_anterior
    aula.alterada = True
    aula.direcoes = nova_sala.direcoes or aula.direcoes

    mensagem_evento = mensagem or f"{aula.titulo} agora é no {nova_sala.nome}."
    alteracao = AlteracaoSala(
        aula=aula,
        sala_anterior=sala_anterior,
        sala_nova=nova_sala,
        mensagem=mensagem,
    )

    texto_aviso = f"A aula de {aula.titulo} agora é no {nova_sala.nome}."
    if mensagem and mensagem not in texto_aviso:
        texto_aviso = f"{texto_aviso} {mensagem}"

    aviso = Aviso(
        id=f"aviso-sala-{uuid4().hex[:10]}",
        aluno_id=aula.aluno_id,
        tipo="sala",
        titulo="Mudança de sala",
        texto=texto_aviso,
        quando=agora_utc(),
        aula_id=aula.id,
    )
    db.add_all([alteracao, aviso])
    db.commit()
    db.refresh(aula)
    db.refresh(aviso)
    db.refresh(alteracao)

    evento = EventoMudancaOut(
        aula_id=aula.id,
        nova_sala=nova_sala.nome,
        sala_anterior=sala_anterior.nome if sala_anterior else None,
        mensagem=mensagem_evento,
    )
    broker.publicar(aula.aluno_id, "mudanca-sala", evento.model_dump(by_alias=True))

    print(f"[PAINEL] mudar_sala aula_id={aula.id} aluno_id={aula.aluno_id} -> disparando push", flush=True)
    push = enviar_para_aluno(
        db,
        aula.aluno_id,
        payload_mudanca_sala(aula, nova_sala, sala_anterior, mensagem),
    )
    print(f"[PAINEL] resultado push: {push}", flush=True)
    return aula, aviso, evento, push


def criar_aviso(
    db: Session,
    *,
    dados: AvisoCreateIn,
) -> tuple[Aviso, int]:
    if dados.aluno_id is not None:
        aluno = db.get(Aluno, dados.aluno_id)
        if not aluno:
            raise LookupError("Aluno não encontrado.")
        destinatarios = [aluno]
    else:
        destinatarios = list(db.scalars(select(Aluno)))

    aviso = Aviso(
        id=f"aviso-{uuid4().hex[:10]}",
        aluno_id=dados.aluno_id,
        tipo=dados.tipo,
        titulo=dados.titulo,
        texto=dados.texto,
        quando=agora_utc(),
        aula_id=dados.aula_id,
    )
    db.add(aviso)
    db.commit()
    db.refresh(aviso)

    evento = {"mensagem": aviso.titulo, "avisoId": aviso.id, "tipo": aviso.tipo}
    if dados.aluno_id is None:
        broker.publicar_para_todos("aviso", evento)
        if dados.enviar_push:
            enviar_para_todos(db, payload_aviso(aviso))
    else:
        broker.publicar(dados.aluno_id, "aviso", evento)
        if dados.enviar_push:
            enviar_para_aluno(db, dados.aluno_id, payload_aviso(aviso))

    return aviso, len(destinatarios)


def resumo(db: Session, data: date) -> ResumoOut:
    aulas = list(db.scalars(select(Aula).where(Aula.data == data)))
    total_labs = int(
        db.scalar(select(func.count()).select_from(Sala).where(Sala.tipo == "lab"))
        or 0
    )
    ids_labs = set(db.scalars(select(Sala.id).where(Sala.tipo == "lab")))
    labs_em_uso = len({aula.sala_id for aula in aulas} & ids_labs)
    ocupacao = round(labs_em_uso / total_labs * 100) if total_labs else 0
    conflitos = detectar_conflitos(db, data, data)

    return ResumoOut(
        data=data,
        aulas_hoje=len(aulas),
        labs_em_uso=labs_em_uso,
        total_labs=total_labs,
        ocupacao_percent=ocupacao,
        conflitos=len(conflitos),
        ultima_atualizacao=agora_utc(),
    )


def alocacoes(db: Session, inicio: date, dias: int = 6) -> AlocacoesOut:
    dias = max(1, min(dias, 14))
    fim = inicio + timedelta(days=dias - 1)
    aulas = aulas_no_periodo(db, inicio, fim)

    por_dia: dict[date, list[Aula]] = defaultdict(list)
    for aula in aulas:
        por_dia[aula.data].append(aula)

    dias_out = [
        DiaPainelOut(
            data=inicio + timedelta(days=indice),
            aulas=[
                aula_painel_para_out(aula)
                for aula in por_dia[inicio + timedelta(days=indice)]
            ],
        )
        for indice in range(dias)
    ]
    return AlocacoesOut(inicio=inicio, fim=fim, dias=dias_out)


def listar_salas(db: Session) -> list[SalaOut]:
    salas = db.scalars(select(Sala).order_by(Sala.nome))
    return [sala_para_out(sala) for sala in salas]


def listar_instrutores(db: Session):
    instrutores = db.scalars(select(Instrutor).order_by(Instrutor.nome))
    return [instrutor_para_out(instrutor) for instrutor in instrutores]


def listar_alunos(db: Session):
    alunos = db.scalars(
        select(Aluno)
        .options(joinedload(Aluno.usuario))
        .join(Aluno.usuario)
        .order_by(Usuario.nome)
    )
    return [aluno_painel_para_out(aluno) for aluno in alunos]


def listar_avisos_painel(db: Session, limite: int = 8) -> list[AvisoPainelOut]:
    """Avisos recentes enviados pela coordenação, com o destinatário."""
    avisos = list(
        db.scalars(
            select(Aviso)
            .options(joinedload(Aviso.aluno).joinedload(Aluno.usuario))
            .order_by(Aviso.quando.desc())
            .limit(limite)
        )
    )
    return [
        AvisoPainelOut(
            id=aviso.id,
            tipo=aviso.tipo,
            titulo=aviso.titulo,
            texto=aviso.texto,
            quando=aviso.quando,
            destinatario=(
                aviso.aluno.usuario.nome if aviso.aluno else "Todos os alunos"
            ),
            aluno_id=aviso.aluno_id,
        )
        for aviso in avisos
    ]
