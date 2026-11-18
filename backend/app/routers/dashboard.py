from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import coordenacao_atual
from ..models import Usuario
from ..schemas import (
    AlocacoesOut,
    AlunoPainelOut,
    AulaPainelOut,
    AvisoCreateIn,
    AvisoCreateOut,
    AvisoPainelOut,
    ConflitoOut,
    InstrutorOut,
    MudancaSalaIn,
    MudancaSalaOut,
    NovaAulaIn,
    ResumoOut,
    SalaOut,
)
from ..serializers import aula_painel_para_out, aula_para_out, aviso_para_out
from ..services.conflitos import detectar_conflitos
from ..services.painel import (
    ErroDeNegocio,
    InstrutorOcupadoError,
    SalaOcupadaError,
    alocacoes,
    criar_aula,
    criar_aviso,
    listar_alunos,
    listar_avisos_painel,
    listar_instrutores,
    listar_salas,
    mudar_sala,
    resumo,
)

router = APIRouter(
    prefix="/dashboard",
    tags=["Coordenação"],
    dependencies=[Depends(coordenacao_atual)],
)


def _inicio_semana() -> date:
    hoje = date.today()
    return hoje - timedelta(days=hoje.weekday())


def _detalhe_conflito(aula) -> dict:
    return {
        "id": aula.id,
        "titulo": aula.titulo,
        "inicio": aula.inicio.strftime("%H:%M"),
        "fim": aula.fim.strftime("%H:%M"),
        "sala": aula.sala.nome,
    }


def _erro_http(erro: Exception) -> HTTPException:
    if isinstance(erro, LookupError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(erro))
    if isinstance(erro, SalaOcupadaError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "mensagem": str(erro),
                "tipo": "sala",
                "conflito": _detalhe_conflito(erro.conflito),
            },
        )
    if isinstance(erro, InstrutorOcupadoError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "mensagem": str(erro),
                "tipo": "instrutor",
                "conflito": _detalhe_conflito(erro.conflito),
            },
        )
    if isinstance(erro, ErroDeNegocio):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(erro))
    raise erro


@router.get("/resumo", response_model=ResumoOut)
def obter_resumo(
    data: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ResumoOut:
    return resumo(db, data or date.today())


@router.get("/alocacoes", response_model=AlocacoesOut)
def obter_alocacoes(
    inicio: date | None = Query(default=None),
    dias: int = Query(default=6, ge=1, le=14),
    db: Session = Depends(get_db),
) -> AlocacoesOut:
    return alocacoes(db, inicio or _inicio_semana(), dias=dias)


@router.get("/grade", response_model=AlocacoesOut, summary="Grade de aulas por período")
def obter_grade(
    inicio: date = Query(...),
    fim: date = Query(...),
    db: Session = Depends(get_db),
) -> AlocacoesOut:
    if fim < inicio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data final precisa ser igual ou posterior à inicial.",
        )
    dias = (fim - inicio).days + 1
    return alocacoes(db, inicio, dias=min(dias, 14))


@router.get("/conflitos", response_model=list[ConflitoOut])
def obter_conflitos(
    inicio: date | None = Query(default=None),
    fim: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ConflitoOut]:
    inicio = inicio or _inicio_semana()
    fim = fim or (inicio + timedelta(days=5))
    return detectar_conflitos(db, inicio, fim)


@router.get("/salas", response_model=list[SalaOut])
def salas(db: Session = Depends(get_db)) -> list[SalaOut]:
    return listar_salas(db)


@router.get("/instrutores", response_model=list[InstrutorOut])
def instrutores(db: Session = Depends(get_db)) -> list[InstrutorOut]:
    return listar_instrutores(db)


@router.get("/alunos", response_model=list[AlunoPainelOut])
def alunos(db: Session = Depends(get_db)) -> list[AlunoPainelOut]:
    return listar_alunos(db)


@router.get(
    "/avisos",
    response_model=list[AvisoPainelOut],
    summary="Avisos recentes enviados aos alunos",
)
def avisos_recentes(
    limite: int = Query(default=8, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[AvisoPainelOut]:
    return listar_avisos_painel(db, limite=limite)


@router.post("/mudanca-sala", response_model=MudancaSalaOut, summary="Mudar uma aula de sala")
def executar_mudanca_sala(
    dados: MudancaSalaIn, db: Session = Depends(get_db)
) -> MudancaSalaOut:
    try:
        aula, aviso, evento, push = mudar_sala(
            db,
            aula_id=dados.aula_id,
            nova_sala_id=dados.nova_sala_id,
            mensagem=dados.mensagem,
        )
    except Exception as erro:
        raise _erro_http(erro) from erro

    return MudancaSalaOut(
        aula=aula_para_out(aula),
        aviso=aviso_para_out(aviso, False),
        evento=evento,
        push=push,
    )


@router.post("/avisos", response_model=AvisoCreateOut, summary="Publicar aviso")
def publicar_aviso(
    dados: AvisoCreateIn, db: Session = Depends(get_db)
) -> AvisoCreateOut:
    try:
        aviso, destinatarios = criar_aviso(db, dados=dados)
    except Exception as erro:
        raise _erro_http(erro) from erro

    return AvisoCreateOut(
        aviso=aviso_para_out(aviso, False), destinatarios=destinatarios
    )


@router.post("/aulas", response_model=AulaPainelOut, summary="Alocar nova aula")
def alocar_aula(dados: NovaAulaIn, db: Session = Depends(get_db)) -> AulaPainelOut:
    try:
        aula = criar_aula(
            db,
            aluno_id=dados.aluno_id,
            sala_id=dados.sala_id,
            instrutor_id=dados.instrutor_id,
            data=dados.data,
            inicio=dados.inicio,
            fim=dados.fim,
            titulo=dados.titulo,
            subtitulo=dados.subtitulo,
            tipo=dados.tipo,
            aula_id=dados.id,
        )
    except Exception as erro:
        raise _erro_http(erro) from erro

    return aula_painel_para_out(aula)
