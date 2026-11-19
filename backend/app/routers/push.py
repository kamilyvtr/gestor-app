from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import aluno_atual, coordenacao_atual
from ..models import Aluno, PushSubscription
from ..schemas import (
    ChavePublicaOut,
    PushSubscriptionIn,
    PushSubscriptionOut,
    PushTesteIn,
    PushTesteOut,
)
from ..services import push as servico_push

router = APIRouter(prefix="/push", tags=["Web Push"])


@router.get("/diagnostico", summary="Estado do Web Push no servidor")
def diagnostico(
    _: object = Depends(coordenacao_atual),
    db: Session = Depends(get_db),
) -> dict:
    """Ajuda a diagnosticar o envio sem precisar de acesso ao shell do servidor."""
    total_inscricoes = int(
        db.scalar(select(func.count()).select_from(PushSubscription)) or 0
    )
    total_alunos = int(db.scalar(select(func.count()).select_from(Aluno)) or 0)
    com_push = int(
        db.scalar(
            select(func.count(func.distinct(PushSubscription.aluno_id))).select_from(
                PushSubscription
            )
        )
        or 0
    )
    derivada = servico_push.chave_publica_derivada()
    return {
        "configurado": settings.vapid_configurado,
        "chave_privada": settings.vapid_origem_chave,
        "chave_publica_tamanho": len(settings.vapid_public_key),
        "chave_publica_confere": (
            None
            if not derivada or not settings.vapid_public_key
            else derivada == settings.vapid_public_key
        ),
        "vapid_subject": settings.vapid_subject,
        "ttl": settings.push_ttl,
        "inscricoes": total_inscricoes,
        "alunos_com_push": com_push,
        "alunos": total_alunos,
        "dica": (
            "Tudo pronto para enviar."
            if settings.vapid_configurado
            else "Defina VAPID_PRIVATE_KEY (PEM) no servidor ou envie "
            "backend/.vapid/private_key.pem no deploy."
        ),
    }


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


@router.delete(
    "/cancelar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Cancela a inscrição de Web Push",
)
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
