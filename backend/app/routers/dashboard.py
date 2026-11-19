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
    AulaAtualizarIn,
    AulaPainelOut,
    AvisoAtualizarIn,
    AvisoCreateIn,
    AvisoCreateOut,
    AvisoOut,
    AvisoPainelOut,
    ConflitoOut,
    InstrutorCreateIn,
    InstrutorOut,
    MudancaSalaIn,
    MudancaSalaOut,
    NotificacaoOut,
    NotificacaoRefOut,
    NovaAulaIn,
    ResumoOut,
    SalaOut,
)
from ..serializers import (
    aula_painel_para_out,
    aula_para_out,
    aviso_para_out,
    instrutor_para_out,
)
from ..services.conflitos import detectar_conflitos
from ..tempo import agora_utc
from ..services.painel import (
    ErroDeNegocio,
    InstrutorOcupadoError,
    SalaOcupadaError,
    alocacoes,
    atualizar_aula,
    atualizar_aviso,
    criar_aula,
    criar_aviso,
    criar_instrutor,
    listar_alunos,
    listar_avisos_painel,
    listar_instrutores,
    listar_salas,
    mudar_sala,
    remover_aula,
    remover_aviso,
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


_DIAS_SEMANA = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)


def _nome_do_dia(data: date) -> str:
    return _DIAS_SEMANA[data.weekday()]


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


@router.get(
    "/notificacoes",
    response_model=list[NotificacaoOut],
    summary="Notificações recentes da coordenação",
)
def notificacoes(
    limite: int = Query(default=8, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[NotificacaoOut]:
    """Reúne conflitos da semana e avisos recentes para o sino do painel.

    Não cria uma infraestrutura paralela: usa a detecção de conflitos e os
    avisos já existentes.
    """
    itens: list[NotificacaoOut] = []
    inicio = _inicio_semana()
    fim = inicio + timedelta(days=6)

    for conflito in detectar_conflitos(db, inicio, fim):
        recurso_slug = conflito.recurso.lower().replace(" ", "-")
        itens.append(
            NotificacaoOut(
                id=f"conflito-{conflito.tipo}-{conflito.data}-{conflito.inicio}-{recurso_slug}",
                tipo="conflito",
                titulo=f"Conflito de {conflito.tipo}: {conflito.recurso}",
                texto=(
                    f"{conflito.aula_a} e {conflito.aula_b} disputam "
                    f"{conflito.recurso} na {_nome_do_dia(conflito.data)} "
                    f"às {conflito.inicio}."
                ),
                quando=agora_utc(),
                referencia=NotificacaoRefOut(tipo="conflito", id=conflito.recurso),
            )
        )

    for aviso in listar_avisos_painel(db, limite=limite):
        itens.append(
            NotificacaoOut(
                id=f"aviso-{aviso.id}",
                tipo="aviso",
                titulo=aviso.titulo,
                texto=aviso.texto,
                quando=aviso.quando,
                referencia=NotificacaoRefOut(tipo="aviso", id=aviso.id),
            )
        )

    itens.sort(key=lambda item: item.quando, reverse=True)
    return itens[:limite]


@router.post(
    "/instrutores",
    response_model=InstrutorOut,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar instrutor",
)
def cadastrar_instrutor(
    dados: InstrutorCreateIn, db: Session = Depends(get_db)
) -> InstrutorOut:
    try:
        instrutor = criar_instrutor(db, nome=dados.nome, iniciais=dados.iniciais)
    except Exception as erro:
        raise _erro_http(erro) from erro

    return instrutor_para_out(instrutor)


@router.get("/alunos", response_model=list[AlunoPainelOut])
def alunos(db: Session = Depends(get_db)) -> list[AlunoPainelOut]:
    return listar_alunos(db)


@router.get(
    "/avisos",
    response_model=list[AvisoPainelOut],
    summary="Avisos recentes enviados aos alunos",
)
def avisos_recentes(
    limite: int = Query(default=8, ge=1, le=200),
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
            notificar=dados.notificar,
            aula_id=dados.id,
        )
    except Exception as erro:
        raise _erro_http(erro) from erro

    return aula_painel_para_out(aula)


@router.patch(
    "/aulas/{aula_id}",
    response_model=AulaPainelOut,
    summary="Editar uma alocação",
)
def editar_aula(
    aula_id: str, dados: AulaAtualizarIn, db: Session = Depends(get_db)
) -> AulaPainelOut:
    campos = dados.model_dump(exclude_unset=True, exclude={"notificar"})
    try:
        aula = atualizar_aula(
            db,
            aula_id=aula_id,
            notificar=dados.notificar,
            **campos,
        )
    except Exception as erro:
        raise _erro_http(erro) from erro

    return aula_painel_para_out(aula)


@router.delete(
    "/aulas/{aula_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Excluir uma alocação",
)
def excluir_aula(
    aula_id: str,
    notificar: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> None:
    try:
        remover_aula(db, aula_id=aula_id, notificar=notificar)
    except Exception as erro:
        raise _erro_http(erro) from erro
    return None


@router.patch(
    "/avisos/{aviso_id}",
    response_model=AvisoOut,
    summary="Editar um aviso",
)
def editar_aviso(
    aviso_id: str, dados: AvisoAtualizarIn, db: Session = Depends(get_db)
) -> AvisoOut:
    campos = dados.model_dump(exclude_unset=True)
    try:
        aviso = atualizar_aviso(db, aviso_id=aviso_id, **campos)
    except Exception as erro:
        raise _erro_http(erro) from erro
    return aviso_para_out(aviso, False)


@router.delete(
    "/avisos/{aviso_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Excluir um aviso",
)
def excluir_aviso(aviso_id: str, db: Session = Depends(get_db)) -> None:
    try:
        remover_aviso(db, aviso_id=aviso_id)
    except Exception as erro:
        raise _erro_http(erro) from erro
    return None
