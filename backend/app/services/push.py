from __future__ import annotations

import json
import logging
from typing import Any

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Aula, Aviso, PushSubscription, Sala
from ..schemas import ResultadoPushOut

logger = logging.getLogger("gestor_senai.push")


def _infos_assinatura(sub: PushSubscription) -> dict[str, Any]:
    return {
        "endpoint": sub.endpoint,
        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
    }


def enviar_para_aluno(
    db: Session, aluno_id: int, payload: dict[str, Any]
) -> ResultadoPushOut:
    if not settings.vapid_configurado:
        return ResultadoPushOut(
            configurado=False,
            motivo="Chaves VAPID não configuradas. Rode scripts/gerar_vapid.py.",
        )

    assinaturas = list(
        db.scalars(
            select(PushSubscription).where(PushSubscription.aluno_id == aluno_id)
        )
    )
    print(
        f"[PUSH] aluno_id={aluno_id}: {len(assinaturas)} inscrição(ões) encontrada(s).",
        flush=True,
    )
    return _enviar(db, assinaturas, payload, aluno_id=aluno_id)


def enviar_para_todos(db: Session, payload: dict[str, Any]) -> ResultadoPushOut:
    if not settings.vapid_configurado:
        return ResultadoPushOut(
            configurado=False,
            motivo="Chaves VAPID não configuradas. Rode scripts/gerar_vapid.py.",
        )

    assinaturas = list(db.scalars(select(PushSubscription)))
    return _enviar(db, assinaturas, payload)


def _enviar(
    db: Session,
    assinaturas: list[PushSubscription],
    payload: dict[str, Any],
    aluno_id: int | None = None,
) -> ResultadoPushOut:
    enviados = falhas = removidas = 0
    corpo = json.dumps(payload, ensure_ascii=False)

    for assinatura in assinaturas:
        try:
            resposta = webpush(
                subscription_info=_infos_assinatura(assinatura),
                data=corpo,
                vapid_private_key=str(settings.vapid_private_key_path),
                vapid_claims={"sub": settings.vapid_subject},
                timeout=settings.push_timeout,
                ttl=60,
            )
            status = getattr(resposta, "status_code", 201)
            print(
                f"[PUSH] aluno_id={aluno_id} endpoint={assinatura.endpoint[:40]} status_code={status}",
                flush=True,
            )
            if status >= 400:
                falhas += 1
                logger.warning("Push recusado (%s) para %s", status, assinatura.endpoint)
            else:
                enviados += 1
        except WebPushException as erro:
            status = getattr(erro.response, "status_code", None)
            corpo_erro = ""
            try:
                corpo_erro = getattr(erro.response, "text", "") or ""
            except Exception:
                corpo_erro = ""
            print(
                f"[PUSH] aluno_id={aluno_id} endpoint={assinatura.endpoint[:40]} status_code={status} (exceção) body={corpo_erro}",
                flush=True,
            )
            if status in (404, 410):
                db.delete(assinatura)
                removidas += 1
            else:
                falhas += 1
                logger.warning("Falha de Web Push: %s", erro)
        except Exception:  # rede, DNS, timeout etc.
            falhas += 1
            logger.exception("Erro inesperado ao enviar Web Push")

    if removidas:
        db.commit()

    return ResultadoPushOut(
        enviados=enviados,
        falhas=falhas,
        removidas=removidas,
        configurado=True,
    )


def inscrever(
    db: Session,
    aluno_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None = None,
) -> PushSubscription:
    assinatura = db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
    if assinatura:
        assinatura.aluno_id = aluno_id
        assinatura.p256dh = p256dh
        assinatura.auth = auth
        assinatura.user_agent = user_agent
    else:
        assinatura = PushSubscription(
            aluno_id=aluno_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
        )
        db.add(assinatura)
    db.commit()
    db.refresh(assinatura)
    return assinatura


def remover(db: Session, aluno_id: int, endpoint: str) -> bool:
    assinatura = db.scalar(
        select(PushSubscription).where(
            PushSubscription.aluno_id == aluno_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    if not assinatura:
        return False
    db.delete(assinatura)
    db.commit()
    return True


def payload_mudanca_sala(
    aula: Aula, sala_nova: Sala, sala_anterior: Sala | None, mensagem: str | None
) -> dict[str, Any]:
    corpo = f"{aula.titulo} agora é no {sala_nova.nome}."
    if mensagem:
        corpo = f"{corpo} {mensagem}"
    return {
        "title": "Sala alterada",
        "body": corpo,
        "url": "./index.html#inicio",
        "tag": f"aula-{aula.id}",
        "data": {
            "aulaId": aula.id,
            "novaSala": sala_nova.nome,
            "salaAnterior": sala_anterior.nome if sala_anterior else None,
        },
    }


def payload_aviso(aviso: Aviso) -> dict[str, Any]:
    return {
        "title": aviso.titulo,
        "body": aviso.texto,
        "url": "./index.html#avisos",
        "tag": f"aviso-{aviso.id}",
        "data": {"avisoId": aviso.id, "tipo": aviso.tipo},
    }
