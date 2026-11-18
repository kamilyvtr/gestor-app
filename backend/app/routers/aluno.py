from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import aluno_atual
from ..models import Aluno
from ..schemas import AgendaOut, AvisoOut, PerfilOut
from ..serializers import perfil_de
from ..services.agenda import (
    listar_avisos,
    marcar_aviso_lido,
    marcar_todos_lidos,
    montar_agenda,
)

router = APIRouter(prefix="/aluno", tags=["Aluno"])


@router.get("/perfil", response_model=PerfilOut)
def perfil(aluno: Aluno = Depends(aluno_atual)) -> PerfilOut:
    return perfil_de(aluno)


@router.get("/agenda", response_model=AgendaOut, summary="Agenda + avisos + alerta")
def agenda(
    dias: int = Query(default=7, ge=1, le=30),
    aluno: Aluno = Depends(aluno_atual),
    db: Session = Depends(get_db),
) -> AgendaOut:
    return montar_agenda(db, aluno, dias=dias)


@router.get("/avisos", response_model=list[AvisoOut])
def avisos(
    apenas_nao_lidos: bool = Query(default=False),
    aluno: Aluno = Depends(aluno_atual),
    db: Session = Depends(get_db),
) -> list[AvisoOut]:
    return listar_avisos(db, aluno, apenas_nao_lidos=apenas_nao_lidos)


@router.post("/avisos/ler-todos", summary="Marcar todos os avisos como lidos")
def ler_todos(
    aluno: Aluno = Depends(aluno_atual), db: Session = Depends(get_db)
) -> dict[str, int]:
    return {"atualizados": marcar_todos_lidos(db, aluno)}


@router.post("/avisos/{aviso_id}/ler", response_model=AvisoOut)
def ler_aviso(
    aviso_id: str,
    aluno: Aluno = Depends(aluno_atual),
    db: Session = Depends(get_db),
) -> AvisoOut:
    aviso = marcar_aviso_lido(db, aluno, aviso_id)
    if not aviso:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Aviso não encontrado."
        )
    return aviso
