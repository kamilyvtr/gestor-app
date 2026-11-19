from __future__ import annotations

from .models import Aluno, Aula, Aviso, Instrutor, Sala, Usuario
from .schemas import (
    AlunoPainelOut,
    AulaOut,
    AulaPainelOut,
    AvisoOut,
    InstrutorOut,
    PerfilOut,
    SalaOut,
    UsuarioOut,
)
from .tempo import formatar_duracao


def perfil_de(aluno: Aluno) -> PerfilOut:
    usuario: Usuario = aluno.usuario
    return PerfilOut(
        nome=usuario.nome,
        nome_completo=usuario.nome_completo,
        iniciais=usuario.iniciais,
        matricula=usuario.matricula,
        curso=aluno.curso,
        unidade=aluno.unidade,
        turno=aluno.turno,
    )


def usuario_para_out(usuario: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=usuario.id,
        matricula=usuario.matricula,
        nome=usuario.nome,
        nome_completo=usuario.nome_completo,
        iniciais=usuario.iniciais,
        papel=usuario.papel,
    )


def aula_para_out(aula: Aula) -> AulaOut:
    return AulaOut(
        id=aula.id,
        inicio=aula.inicio.strftime("%H:%M"),
        fim=aula.fim.strftime("%H:%M"),
        duracao=formatar_duracao(aula.inicio, aula.fim),
        titulo=aula.titulo,
        subtitulo=aula.subtitulo,
        sala=aula.sala.nome,
        sala_anterior=aula.sala_anterior.nome if aula.sala_anterior else None,
        instrutor=aula.instrutor.nome,
        iniciais=aula.instrutor.iniciais,
        tipo=aula.tipo,
        alterada=aula.alterada,
        direcoes=aula.direcoes or aula.sala.direcoes,
    )


def aula_painel_para_out(aula: Aula) -> AulaPainelOut:
    base = aula_para_out(aula).model_dump()
    return AulaPainelOut(
        **base,
        aluno=aula.aluno.usuario.nome,
        aluno_id=aula.aluno_id,
        sala_id=aula.sala_id,
        instrutor_id=aula.instrutor_id,
    )


def aviso_para_out(aviso: Aviso, lida: bool) -> AvisoOut:
    return AvisoOut(
        id=aviso.id,
        tipo=aviso.tipo,
        titulo=aviso.titulo,
        texto=aviso.texto,
        quando=aviso.quando,
        lida=lida,
        aula_id=aviso.aula_id,
    )


def sala_para_out(sala: Sala) -> SalaOut:
    return SalaOut(
        id=sala.id,
        nome=sala.nome,
        bloco=sala.bloco,
        andar=sala.andar,
        tipo=sala.tipo,
        direcoes=sala.direcoes,
    )


def instrutor_para_out(instrutor: Instrutor) -> InstrutorOut:
    return InstrutorOut(
        id=instrutor.id, nome=instrutor.nome, iniciais=instrutor.iniciais
    )


def aluno_painel_para_out(aluno: Aluno) -> AlunoPainelOut:
    return AlunoPainelOut(
        id=aluno.id,
        nome=aluno.usuario.nome,
        matricula=aluno.usuario.matricula,
        curso=aluno.curso,
        turno=aluno.turno,
    )
