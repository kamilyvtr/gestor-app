from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from ..models import AlteracaoSala, Aluno, Aula, Aviso, AvisoLeitura
from ..schemas import AgendaOut, AlertaOut, AvisoOut, DiaOut
from ..serializers import aula_para_out, aviso_para_out, perfil_de
from ..tempo import agora_utc, hora_relativa


def listar_avisos(
    db: Session,
    aluno: Aluno,
    *,
    apenas_nao_lidos: bool = False,
    limite: int | None = None,
) -> list[AvisoOut]:
    avisos = list(
        db.scalars(
            select(Aviso)
            .where(or_(Aviso.aluno_id == aluno.id, Aviso.aluno_id.is_(None)))
            .order_by(Aviso.quando.desc())
        )
    )
    lidas = set(
        db.scalars(
            select(AvisoLeitura.aviso_id).where(AvisoLeitura.aluno_id == aluno.id)
        )
    )
    resultado = [aviso_para_out(aviso, aviso.id in lidas) for aviso in avisos]
    if apenas_nao_lidos:
        resultado = [aviso for aviso in resultado if not aviso.lida]
    if limite is not None:
        resultado = resultado[:limite]
    return resultado


def marcar_aviso_lido(db: Session, aluno: Aluno, aviso_id: str) -> AvisoOut | None:
    aviso = db.get(Aviso, aviso_id)
    if not aviso or aviso.aluno_id not in (None, aluno.id):
        return None

    leitura = db.scalar(
        select(AvisoLeitura).where(
            AvisoLeitura.aluno_id == aluno.id,
            AvisoLeitura.aviso_id == aviso_id,
        )
    )
    if leitura:
        leitura.lida_em = agora_utc()
    else:
        db.add(AvisoLeitura(aluno_id=aluno.id, aviso_id=aviso_id))
    db.commit()
    return aviso_para_out(aviso, True)


def marcar_todos_lidos(db: Session, aluno: Aluno) -> int:
    avisos = list(
        db.scalars(
            select(Aviso).where(
                or_(Aviso.aluno_id == aluno.id, Aviso.aluno_id.is_(None))
            )
        )
    )
    lidas = set(
        db.scalars(
            select(AvisoLeitura.aviso_id).where(AvisoLeitura.aluno_id == aluno.id)
        )
    )
    novas = 0
    for aviso in avisos:
        if aviso.id not in lidas:
            db.add(AvisoLeitura(aluno_id=aluno.id, aviso_id=aviso.id))
            novas += 1
    db.commit()
    return novas


def _montar_alerta(db: Session, aluno: Aluno) -> AlertaOut | None:
    limite = agora_utc() - timedelta(hours=24)
    alteracao = db.scalar(
        select(AlteracaoSala)
        .join(AlteracaoSala.aula)
        .where(Aula.aluno_id == aluno.id, AlteracaoSala.criada_em >= limite)
        .options(
            joinedload(AlteracaoSala.aula),
            joinedload(AlteracaoSala.sala_nova),
        )
        .order_by(AlteracaoSala.criada_em.desc())
        .limit(1)
    )
    if not alteracao:
        return None

    texto = (
        f"A aula de {alteracao.aula.titulo} agora é no "
        f"{alteracao.sala_nova.nome}."
    )
    if alteracao.mensagem and alteracao.mensagem not in texto:
        texto = f"{texto} {alteracao.mensagem}"

    return AlertaOut(
        id=str(alteracao.id),
        titulo="Mudança de sala",
        texto=texto,
        hora=hora_relativa(alteracao.criada_em),
        aula_id=alteracao.aula_id,
    )


def montar_agenda(db: Session, aluno: Aluno, dias: int = 7) -> AgendaOut:
    dias = max(1, min(dias, 30))
    hoje = date.today()
    ultimo_dia = hoje + timedelta(days=dias - 1)

    aulas = list(
        db.scalars(
            select(Aula)
            .where(Aula.aluno_id == aluno.id, Aula.data >= hoje, Aula.data <= ultimo_dia)
            .options(
                joinedload(Aula.sala),
                joinedload(Aula.sala_anterior),
                joinedload(Aula.instrutor),
            )
            .order_by(Aula.data, Aula.inicio)
        )
    )

    por_dia: dict[date, list[Aula]] = defaultdict(list)
    for aula in aulas:
        por_dia[aula.data].append(aula)

    dias_out = [
        DiaOut(
            data=hoje + timedelta(days=indice),
            aulas=[aula_para_out(aula) for aula in por_dia[hoje + timedelta(days=indice)]],
        )
        for indice in range(dias)
    ]

    agora = datetime.now()
    proxima_id = next(
        (
            aula.id
            for aula in aulas
            if datetime.combine(aula.data, aula.fim) >= agora
        ),
        None,
    )

    return AgendaOut(
        aluno=perfil_de(aluno),
        proxima_aula_id=proxima_id,
        alerta=_montar_alerta(db, aluno),
        dias=dias_out,
        avisos=listar_avisos(db, aluno, limite=20),
    )
