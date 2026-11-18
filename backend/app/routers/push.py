from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import aluno_atual
from ..models import Aluno
from ..schemas import (
    ChavePublicaOut,
    PushSubscriptionIn,
    PushSubscriptionOut,
    PushTesteIn,
    PushTesteOut,
)
from ..services import push as servico_push

router = APIRouter(prefix="/push", tags=["Web Push"])


@router.get("/chave-publica", response_model=ChavePublicaOut)
def chave_publica() -> ChavePublicaOut:
    if not settings.vapid_configurado:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push não configurado. Rode scripts/gerar_vapid.py.",
        )
    return ChavePublicaOut(public_key=settings.vapid_public_key)


@router.post("/inscrever", response_model=PushSubscriptionOut, status_code=201)
def inscrever(
    dados: PushSubscriptionIn,
    request: Request,
    aluno: Aluno = Depends(aluno_atual),
    db: Session = Depends(get_db),
) -> PushSubscriptionOut:
    assinatura = servico_push.inscrever(
        db,
        aluno_id=aluno.id,
        endpoint=dados.endpoint,
        p256dh=dados.keys.p256dh,
        auth=dados.keys.auth,
        user_agent=request.headers.get("user-agent"),
    )
    return PushSubscriptionOut(
        id=assinatura.id,
        endpoint=assinatura.endpoint,
        criada_em=assinatura.criada_em,
    )


@router.delete("/cancelar", status_code=status.HTTP_204_NO_CONTENT)
def cancelar(
    endpoint: str = Query(min_length=10),
    aluno: Aluno = Depends(aluno_atual),
    db: Session = Depends(get_db),
) -> None:
    if not servico_push.remover(db, aluno.id, endpoint):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inscrição não encontrada para este aluno.",
        )


@router.post("/teste", response_model=PushTesteOut)
def enviar_teste(
    dados: PushTesteIn | None = None,
    aluno: Aluno = Depends(aluno_atual),
    db: Session = Depends(get_db),
) -> PushTesteOut:
    if not settings.vapid_configurado:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push não configurado. Rode scripts/gerar_vapid.py.",
        )

    dados = dados or PushTesteIn()
    resultado = servico_push.enviar_para_aluno(
        db,
        aluno.id,
        {
            "title": dados.titulo,
            "body": dados.corpo,
            "url": dados.url,
            "tag": "teste-gestor-senai",
        },
    )
    return PushTesteOut(resultado=resultado)
