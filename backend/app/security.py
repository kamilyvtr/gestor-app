from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from .config import settings

ALGORITMO = "pbkdf2_sha256"


def _b64codificar(valor: bytes) -> str:
    return base64.urlsafe_b64encode(valor).decode("ascii").rstrip("=")


def _b64decodificar(valor: str) -> bytes:
    return base64.urlsafe_b64decode(valor + "=" * (-len(valor) % 4))


def gerar_hash_senha(senha: str) -> str:
    salt = secrets.token_bytes(16)
    derivada = hashlib.pbkdf2_hmac(
        "sha256", senha.encode("utf-8"), salt, settings.senha_iteracoes
    )
    return f"{ALGORITMO}${settings.senha_iteracoes}${_b64codificar(salt)}${_b64codificar(derivada)}"


def verificar_senha(senha: str, hash_armazenado: str) -> bool:
    try:
        algoritmo, iteracoes, salt_b64, hash_b64 = hash_armazenado.split("$", 3)
        if algoritmo != ALGORITMO:
            return False
        salt = _b64decodificar(salt_b64)
        esperado = _b64decodificar(hash_b64)
        calculado = hashlib.pbkdf2_hmac(
            "sha256", senha.encode("utf-8"), salt, int(iteracoes)
        )
        return hmac.compare_digest(calculado, esperado)
    except (ValueError, TypeError):
        return False


def criar_token(usuario_id: int, papel: str, nome: str) -> tuple[str, datetime]:
    emitido = datetime.now(timezone.utc)
    expira = emitido + timedelta(minutes=settings.jwt_expira_minutos)
    payload = {
        "sub": str(usuario_id),
        "papel": papel,
        "nome": nome,
        "iat": emitido,
        "exp": expira,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algoritmo)
    return token, expira


def ler_token(token: str) -> dict:
    """Decodifica o JWT. Levanta ValueError para qualquer token inválido/expirado."""
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algoritmo],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.PyJWTError as erro:
        raise ValueError("Token inválido ou expirado.") from erro
