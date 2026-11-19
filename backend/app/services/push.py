from __future__ import annotations

import base64
import json
import logging
import os
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


def _sem_configuracao(motivo: str) -> ResultadoPushOut:
    logger.warning("[PUSH] envio ignorado: %s", motivo)
    return ResultadoPushOut(configurado=False, motivo=motivo)


def chave_publica_derivada() -> str | None:
    """Chave pública (base64url) correspondente à chave privada configurada.

    Serve para conferir se a VAPID_PUBLIC_KEY do painel combina com a privada —
    quando não combinam, o serviço de push responde 403 e nada é entregue.
    """
    chave = settings.chave_privada_vapid
    if not chave:
        return None
    try:
        from cryptography.hazmat.primitives import serialization
        from pywebpush import Vapid

        vapid = (
            Vapid.from_file(private_key_file=chave)
            if os.path.isfile(chave)
            else Vapid.from_string(private_key=chave)
        )
        if hasattr(vapid.public_key, "public_bytes"):
            bruto = vapid.public_key.public_bytes(
                serialization.Encoding.X962,
                serialization.PublicFormat.UncompressedPoint,
            )
        else:  # Vapid01 já expõe os bytes
            bruto = vapid.public_key
        return base64.urlsafe_b64encode(bruto).rstrip(b"=").decode()
    except Exception:
        logger.exception("[PUSH] não foi possível derivar a chave pública")
        return None


def enviar_para_aluno(
    db: Session, aluno_id: int, payload: dict[str, Any]
) -> ResultadoPushOut:
    if not settings.vapid_configurado:
        return _sem_configuracao(
            "Chaves VAPID não configuradas no servidor "
            f"(chave privada: {settings.vapid_origem_chave})."
        )

    assinaturas = list(
        db.scalars(
            select(PushSubscription).where(PushSubscription.aluno_id == aluno_id)
        )
    )
    logger.info(
        "[PUSH] aluno_id=%s: %s inscrição(ões) encontrada(s).",
        aluno_id,
        len(assinaturas),
    )
    if not assinaturas:
        return ResultadoPushOut(
            configurado=True,
            enviados=0,
            motivo="O aluno ainda não ativou as notificações neste aparelho.",
        )
    return _enviar(db, assinaturas, payload, aluno_id=aluno_id)


def enviar_para_todos(db: Session, payload: dict[str, Any]) -> ResultadoPushOut:
    if not settings.vapid_configurado:
        return _sem_configuracao(
            "Chaves VAPID não configuradas no servidor "
            f"(chave privada: {settings.vapid_origem_chave})."
        )

    assinaturas = list(db.scalars(select(PushSubscription)))
    if not assinaturas:
        return ResultadoPushOut(
            configurado=True,
            enviados=0,
            motivo="Nenhum aluno ativou as notificações ainda.",
        )
    return _enviar(db, assinaturas, payload)


def _enviar(
    db: Session,
    assinaturas: list[PushSubscription],
    payload: dict[str, Any],
    aluno_id: int | None = None,
) -> ResultadoPushOut:
    chave_privada = settings.chave_privada_vapid
    if not chave_privada:
        return _sem_configuracao("Chave privada VAPID ilegível.")

    enviados = falhas = removidas = 0
    corpo = json.dumps(payload, ensure_ascii=False)

    for assinatura in assinaturas:
        try:
            resposta = webpush(
                subscription_info=_infos_assinatura(assinatura),
                data=corpo,
                vapid_private_key=chave_privada,
                vapid_claims={"sub": settings.vapid_subject},
                headers={"Urgency": "high"},
                timeout=settings.push_timeout,
                ttl=settings.push_ttl,
            )
            status = getattr(resposta, "status_code", 201)
            logger.info(
                "[PUSH] aluno_id=%s endpoint=%s… status=%s",
                aluno_id,
                assinatura.endpoint[:40],
                status,
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
            logger.warning(
                "[PUSH] aluno_id=%s endpoint=%s… status=%s (exceção) body=%s",
                aluno_id,
                assinatura.endpoint[:40],
                status,
                corpo_erro[:200],
            )
            if status in (404, 410):
                db.delete(assinatura)
                removidas += 1
            elif status == 403:
                falhas += 1
                logger.error(
                    "[PUSH] 403 do serviço de push: a VAPID_PUBLIC_KEY não confere com a "
                    "VAPID_PRIVATE_KEY no servidor. Rode GET /push/diagnostico "
                    "(campo chave_publica_confere)."
                )
            else:
                falhas += 1
        except Exception:  # rede, DNS, timeout etc.
            falhas += 1
            logger.exception("Erro inesperado ao enviar Web Push")

    if removidas:
        db.commit()
        logger.info("[PUSH] %s inscrição(ões) expiradas removidas.", removidas)

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
