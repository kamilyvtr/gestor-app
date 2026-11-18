from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import usuario_atual
from ..models import Aluno, Usuario
from ..schemas import LoginIn, MeOut, TokenOut
from ..security import criar_token, verificar_senha
from ..serializers import perfil_de, usuario_para_out

router = APIRouter(prefix="/auth", tags=["Autenticação"])


def _definir_cookie(response: Response, token: str, expira_em) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        expires=expira_em,
        path="/",
    )


@router.post("/login", response_model=TokenOut, summary="Login do aluno ou da coordenação")
def login(dados: LoginIn, response: Response, db: Session = Depends(get_db)) -> TokenOut:
    usuario = db.scalar(select(Usuario).where(Usuario.matricula == dados.matricula))
    if not usuario or not usuario.ativo or not verificar_senha(dados.senha, usuario.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Matrícula ou senha inválidos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token, expira_em = criar_token(usuario.id, usuario.papel, usuario.nome)
    _definir_cookie(response, token, expira_em)
    return TokenOut(
        access_token=token,
        expira_em=expira_em,
        usuario=usuario_para_out(usuario),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(settings.cookie_name, path="/")


@router.get("/me", response_model=MeOut, summary="Usuário autenticado")
def me(
    usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)
) -> MeOut:
    aluno = db.scalar(select(Aluno).where(Aluno.usuario_id == usuario.id))
    return MeOut(
        usuario=usuario_para_out(usuario),
        perfil=perfil_de(aluno) if aluno else None,
    )
