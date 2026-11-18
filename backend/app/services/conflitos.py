from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.orm import Session

from ..models import Aluno, Aula
from ..schemas import ConflitoOut


def aulas_no_periodo(db: Session, inicio: date, fim: date) -> list[Aula]:
    return list(
        db.scalars(
            select(Aula)
            .where(Aula.data >= inicio, Aula.data <= fim)
            .options(
                joinedload(Aula.sala),
                joinedload(Aula.instrutor),
                joinedload(Aula.aluno).joinedload(Aluno.usuario),
            )
            .order_by(Aula.data, Aula.inicio)
        )
    )


def detectar_conflitos(db: Session, inicio: date, fim: date) -> list[ConflitoOut]:
    aulas = aulas_no_periodo(db, inicio, fim)
    conflitos: list[ConflitoOut] = []

    for tipo, chave_recurso, nome_recurso in (
        ("sala", lambda aula: aula.sala_id, lambda aula: aula.sala.nome),
        ("instrutor", lambda aula: aula.instrutor_id, lambda aula: aula.instrutor.nome),
    ):
        grupos: dict[tuple[date, int], list[Aula]] = defaultdict(list)
        for aula in aulas:
            grupos[(aula.data, chave_recurso(aula))].append(aula)

        for (_data, _recurso_id), lista in grupos.items():
            if len(lista) < 2:
                continue
            lista.sort(key=lambda aula: (aula.inicio, aula.fim))
            for indice, aula_a in enumerate(lista):
                for aula_b in lista[indice + 1 :]:
                    if aula_a.inicio >= aula_b.fim:
                        continue
                    if aula_b.inicio >= aula_a.fim:
                        break

                    inicio_conflito = max(aula_a.inicio, aula_b.inicio)
                    fim_conflito = min(aula_a.fim, aula_b.fim)
                    conflitos.append(
                        ConflitoOut(
                            tipo=tipo,
                            recurso=nome_recurso(aula_a),
                            data=aula_a.data,
                            inicio=inicio_conflito.strftime("%H:%M"),
                            fim=fim_conflito.strftime("%H:%M"),
                            aula_a=aula_a.titulo,
                            aula_b=aula_b.titulo,
                            detalhe=(
                                f"{nome_recurso(aula_a)} está alocado para duas aulas "
                                f"no mesmo horário ({aula_a.data:%d/%m/%Y})."
                            ),
                        )
                    )

    conflitos.sort(key=lambda item: (item.data, item.inicio, item.tipo))
    return conflitos


def buscar_conflito_sala(
    db: Session, aula: Aula, nova_sala_id: int
) -> Aula | None:
    """Retorna outra aula que já ocupa a sala no mesmo intervalo, se existir."""
    return db.scalar(
        select(Aula)
        .where(
            Aula.id != aula.id,
            Aula.data == aula.data,
            Aula.sala_id == nova_sala_id,
            Aula.inicio < aula.fim,
            Aula.fim > aula.inicio,
        )
        .options(joinedload(Aula.sala), joinedload(Aula.instrutor))
        .order_by(Aula.inicio)
        .limit(1)
    )
