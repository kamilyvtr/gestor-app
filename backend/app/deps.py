from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Aluno, Usuario
from .security import ler_token

esquema_bearer = HTTPBearer(auto_error=False)


def _extrair_token(
    request: Request, credenciais: HTTPAuthorizationCredentials | None
) -> str | None:
    if credenciais and credenciais.scheme.lower() == "bearer":
        return credenciais.credentials

    # EventSource não permite cabeçalhos personalizados; aceitamos o token
    # na query apenas para o canal SSE. Para o restante, prefira o header.
    token_query = request.query_params.get("token") or request.query_params.get(
        "access_token"
    )
    if token_query:
        return token_query

    return request.cookies.get(settings.cookie_name)


def usuario_atual(
    request: Request,
    credenciais: HTTPAuthorizationCredentials | None = Depends(esquema_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    token = _extrair_token(request, credenciais)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = ler_token(token)
        usuario_id = int(payload["sub"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    usuario = db.get(Usuario, usuario_id)
    if not usuario or not usuario.ativo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário inexistente ou inativo.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return usuario


def aluno_atual(
    usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)
) -> Aluno:
    if usuario.papel != "aluno":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta rota é exclusiva do aluno.",
        )

    aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).one_or_none()
    if not aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Perfil de aluno não encontrado.",
        )
    return aluno


def coordenacao_atual(usuario: Usuario = Depends(usuario_atual)) -> Usuario:
    if usuario.papel != "coordenacao":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito à coordenação.",
        )
    return usuario
