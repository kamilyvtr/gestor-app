"""Dados de demonstração do Gestor SENAI.

Uso:
    python -m app.seed            # cria somente se o banco estiver vazio
    python -m app.seed --reset    # apaga e recria tudo
"""

from __future__ import annotations

import argparse
from datetime import date, time, timedelta
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, criar_banco, engine
from .models import (
    Aluno,
    AlteracaoSala,
    Aula,
    Aviso,
    AvisoLeitura,
    Instrutor,
    Sala,
    Usuario,
)
from .security import gerar_hash_senha
from .tempo import agora_utc

SENHA_DEMO = "senai123"

# Contas individuais solicitadas para o painel do aluno.
# O login é a credencial; a matrícula acadêmica dos registros existentes não é alterada.
CONTAS_GRUPO = (
    {"login": "202607", "nome": "Kamily Vitória", "iniciais": "KV"},
    {"login": "202601", "nome": "Keven", "iniciais": "K"},
    {"login": "202602", "nome": "Lucas Eduardo", "iniciais": "LE"},
    {"login": "202603", "nome": "Vanildo", "iniciais": "V"},
    {"login": "202604", "nome": "Rafaella Rochely", "iniciais": "RR"},
)

INSTRUTOR_COMPARTILHADO = {"nome": "Isael Lima", "iniciais": "IL"}


def _usuario(
    db: Session,
    *,
    matricula: str,
    nome: str,
    nome_completo: str,
    iniciais: str,
    papel: str = "aluno",
    curso: str | None = None,
    unidade: str | None = None,
    turno: str | None = None,
) -> tuple[Usuario, Aluno | None]:
    usuario = Usuario(
        matricula=matricula,
        senha_hash=gerar_hash_senha(SENHA_DEMO),
        papel=papel,
        nome=nome,
        nome_completo=nome_completo,
        iniciais=iniciais,
        ativo=True,
    )
    db.add(usuario)
    db.flush()

    aluno = None
    if papel == "aluno":
        aluno = Aluno(
            usuario=usuario,
            curso=curso or "Técnico em Automação Industrial",
            unidade=unidade or "SENAI · Automação",
            turno=turno or "Tarde",
        )
        db.add(aluno)
        db.flush()
    return usuario, aluno


def semear(db: Session) -> bool:
    """Cria o conjunto de demonstração. Retorna False se já houver usuários."""
    if db.scalar(select(func.count()).select_from(Usuario)):
        return False

    hoje = date.today()

    coord, _ = _usuario(
        db,
        matricula="coord01",
        nome="Coordenação",
        nome_completo="Coordenação Pedagógica",
        iniciais="CP",
        papel="coordenacao",
    )

    _, joao = _usuario(
        db,
        matricula="202604178821",
        nome="João Vitor",
        nome_completo="João Vitor Almeida",
        iniciais="JV",
        curso="Técnico em Automação Industrial",
        unidade="SENAI · Automação",
        turno="Tarde",
    )
    _, mariana = _usuario(
        db,
        matricula="202604178822",
        nome="Mariana Souza",
        nome_completo="Mariana Souza Lima",
        iniciais="MS",
        curso="Técnico em Automação Industrial",
        unidade="SENAI · Automação",
        turno="Manhã",
    )
    _, pedro = _usuario(
        db,
        matricula="202604178823",
        nome="Pedro Henrique",
        nome_completo="Pedro Henrique Costa",
        iniciais="PH",
        curso="Técnico em Mecatrônica",
        unidade="SENAI · Mecatrônica",
        turno="Manhã",
    )

    salas = {
        "Lab 02": Sala(
            nome="Lab 02",
            bloco="Bloco B",
            andar="1º andar",
            tipo="lab",
            direcoes="Bloco B, 1º andar, primeira porta à direita.",
        ),
        "Lab 03": Sala(
            nome="Lab 03",
            bloco="Bloco B",
            andar="1º andar",
            tipo="lab",
            direcoes="Bloco B, 1º andar, ao lado do Lab 02.",
        ),
        "Lab 04": Sala(
            nome="Lab 04",
            bloco="Bloco B",
            andar="2º andar",
            tipo="lab",
            direcoes="Bloco B, 2º andar, em frente à escada.",
        ),
        "Lab 05": Sala(
            nome="Lab 05",
            bloco="Bloco B",
            andar="2º andar",
            tipo="lab",
            direcoes="Bloco B, 2º andar, ao lado do Lab 04.",
        ),
        "Sala 01": Sala(
            nome="Sala 01",
            bloco="Bloco A",
            andar="Térreo",
            tipo="sala",
            direcoes="Bloco A, térreo, corredor principal.",
        ),
        "Sala 03": Sala(
            nome="Sala 03",
            bloco="Bloco A",
            andar="2º andar",
            tipo="sala",
            direcoes="Bloco A, 2º andar, sala 03.",
        ),
    }
    instrutores = {
        "Rafael Lima": Instrutor(nome="Rafael Lima", iniciais="RL"),
        "Carlos Menezes": Instrutor(nome="Carlos Menezes", iniciais="CM"),
        "Ana Paula": Instrutor(nome="Ana Paula", iniciais="AP"),
    }
    db.add_all([*salas.values(), *instrutores.values()])
    db.flush()

    def aula(
        aluno: Aluno,
        offset: int,
        inicio: tuple[int, int],
        fim: tuple[int, int],
        titulo: str,
        subtitulo: str,
        sala: str,
        instrutor: str,
        *,
        tipo: str = "teórica",
        alterada: bool = False,
        sala_anterior: str | None = None,
        aula_id: str | None = None,
    ) -> Aula:
        registro = Aula(
            id=aula_id or f"aula-{uuid4().hex[:10]}",
            aluno=aluno,
            data=hoje + timedelta(days=offset),
            inicio=time(*inicio),
            fim=time(*fim),
            titulo=titulo,
            subtitulo=subtitulo,
            tipo=tipo,
            sala=salas[sala],
            sala_anterior=salas[sala_anterior] if sala_anterior else None,
            instrutor=instrutores[instrutor],
            alterada=alterada,
            direcoes=salas[sala].direcoes,
        )
        db.add(registro)
        return registro

    # ---------------------------------------------------------------- hoje
    aula_clp = aula(
        joao,
        0,
        (14, 0),
        (16, 0),
        "Automação Industrial",
        "CLP · Controlador Lógico Programável",
        "Lab 05",
        "Rafael Lima",
        tipo="prática",
        alterada=True,
        sala_anterior="Lab 04",
        aula_id="aula-clp-14",
    )
    aula(
        joao,
        0,
        (16, 0),
        (17, 30),
        "Soldagem MIG",
        "Processos de fabricação",
        "Lab 02",
        "Carlos Menezes",
        tipo="prática",
        aula_id="aula-soldagem-16",
    )
    aula(
        joao,
        0,
        (18, 0),
        (19, 0),
        "Segurança do Trabalho",
        "Normas e EPIs",
        "Sala 03",
        "Ana Paula",
        aula_id="aula-seguranca-18",
    )
    aula(
        joao,
        0,
        (19, 0),
        (20, 30),
        "Projeto Integrador",
        "Projeto final de automação",
        "Lab 05",
        "Rafael Lima",
        tipo="prática",
        aula_id="aula-projeto-19",
    )

    aula(
        mariana,
        0,
        (8, 0),
        (9, 30),
        "Comandos Elétricos",
        "Acionamentos e proteção",
        "Lab 02",
        "Carlos Menezes",
        tipo="prática",
    )
    aula(
        mariana,
        0,
        (10, 0),
        (11, 30),
        "Manutenção Industrial",
        "Manutenção preventiva",
        "Lab 03",
        "Ana Paula",
        tipo="prática",
        aula_id="aula-manutencao-mariana",
    )
    aula(
        mariana,
        0,
        (15, 0),
        (16, 30),
        "Instrumentação",
        "Sensores e atuadores",
        "Lab 03",
        "Ana Paula",
        tipo="prática",
        aula_id="aula-instrumentacao-mariana",
    )

    aula(
        pedro,
        0,
        (8, 0),
        (9, 30),
        "Desenho Técnico",
        "Leitura de projetos",
        "Sala 01",
        "Ana Paula",
    )
    aula(
        pedro,
        0,
        (10, 30),
        (12, 0),
        "Pneumática",
        "Circuitos pneumáticos",
        "Lab 03",
        "Carlos Menezes",
        tipo="prática",
        aula_id="aula-pneumatica-pedro",
    )
    aula(
        pedro,
        0,
        (13, 30),
        (15, 0),
        "Robótica",
        "Introdução à robótica industrial",
        "Lab 04",
        "Ana Paula",
        tipo="prática",
    )

    # ------------------------------------------------------------ amanhã
    aula(joao, 1, (8, 0), (9, 30), "Automação Industrial", "CLP avançado", "Lab 04", "Rafael Lima", tipo="prática")
    aula(joao, 1, (10, 0), (11, 30), "Soldagem MIG", "Prática em bancada", "Lab 02", "Carlos Menezes", tipo="prática")
    aula(mariana, 1, (8, 0), (9, 30), "Instrumentação", "Calibração de sensores", "Lab 03", "Ana Paula", tipo="prática")
    aula(mariana, 1, (14, 0), (15, 30), "Comandos Elétricos", "Partida de motores", "Lab 02", "Carlos Menezes", tipo="prática")
    aula(pedro, 1, (10, 0), (11, 30), "Robótica", "Programação de trajetórias", "Lab 04", "Rafael Lima", tipo="prática")
    aula(pedro, 1, (14, 0), (15, 30), "Desenho Técnico", "Projeto mecânico", "Sala 01", "Ana Paula")

    # ------------------------------------------------------ próximos dias
    aula(joao, 2, (14, 0), (16, 0), "Projeto Integrador", "Orientação do projeto", "Lab 05", "Rafael Lima", tipo="prática")
    aula(mariana, 2, (8, 0), (9, 30), "Manutenção Industrial", "Análise de falhas", "Lab 03", "Ana Paula", tipo="prática")
    aula(joao, 3, (8, 0), (9, 30), "Segurança do Trabalho", "Normas regulamentadoras", "Sala 03", "Ana Paula")
    aula(joao, 3, (10, 0), (12, 0), "Automação Industrial", "Integração de CLP", "Lab 05", "Rafael Lima", tipo="prática")
    aula(pedro, 3, (8, 0), (9, 30), "Pneumática", "Eletropneumática", "Lab 03", "Carlos Menezes", tipo="prática")
    aula(joao, 4, (14, 0), (15, 30), "Soldagem MIG", "Solda em alumínio", "Lab 02", "Carlos Menezes", tipo="prática")
    aula(mariana, 4, (10, 0), (11, 30), "Instrumentação", "Sensores industriais", "Lab 04", "Rafael Lima", tipo="prática")

    db.flush()

    # Mudança de sala que alimenta o alerta em tempo real do app.
    db.add(
        AlteracaoSala(
            aula=aula_clp,
            sala_anterior=salas["Lab 04"],
            sala_nova=salas["Lab 05"],
            mensagem="Lab 04 está em manutenção preventiva.",
            criada_em=agora_utc() - timedelta(minutes=10),
        )
    )

    avisos = [
        Aviso(
            id="aviso-sala-clp",
            aluno_id=joao.id,
            tipo="sala",
            titulo="Mudança de sala",
            texto="A aula de Automação Industrial agora é no Lab 05.",
            quando=agora_utc() - timedelta(minutes=10),
            aula_id=aula_clp.id,
        ),
        Aviso(
            id="aviso-material-clp",
            aluno_id=joao.id,
            tipo="material",
            titulo="Material de CLP disponível",
            texto="A apostila da aula de CLP foi publicada na área do aluno.",
            quando=agora_utc() - timedelta(hours=2),
        ),
        Aviso(
            id="aviso-evento-inovacao",
            aluno_id=joao.id,
            tipo="evento",
            titulo="Semana de Inovação SENAI",
            texto="Inscrições abertas para a maratona de projetos até sexta-feira.",
            quando=agora_utc() - timedelta(days=1),
        ),
        Aviso(
            id="aviso-global-lab04",
            aluno_id=None,
            tipo="sistema",
            titulo="Manutenção no Lab 04",
            texto="O Lab 04 ficará indisponível durante a manutenção preventiva.",
            quando=agora_utc() - timedelta(hours=5),
        ),
    ]
    db.add_all(avisos)
    db.flush()

    # O aviso global já foi lido pelo João; restam 3 não lidos.
    db.add(AvisoLeitura(aluno_id=joao.id, aviso_id="aviso-global-lab04"))

    db.commit()

    # Evita warnings de variável não usada em ferramentas de lint.
    _ = coord
    _ = mariana
    _ = pedro
    return True


def garantir_contas_grupo(db: Session) -> dict[str, list[str]]:
    """Cria, de forma idempotente, as contas do grupo e o instrutor Isael Lima.

    Não altera usuários existentes nem matrículas. Retorna o que foi criado.
    """
    criados: list[str] = []
    for conta in CONTAS_GRUPO:
        existe = db.scalar(
            select(Usuario).where(Usuario.matricula == conta["login"])
        )
        if existe:
            continue
        usuario = Usuario(
            matricula=conta["login"],
            senha_hash=gerar_hash_senha(SENHA_DEMO),
            papel="aluno",
            nome=conta["nome"],
            nome_completo=conta["nome"],
            iniciais=conta["iniciais"],
            ativo=True,
        )
        db.add(usuario)
        db.flush()
        db.add(
            Aluno(
                usuario=usuario,
                curso="Técnico em Automação Industrial",
                unidade="SENAI · Automação",
                turno="Tarde",
            )
        )
        criados.append(conta["login"])

    instrutor_criado = False
    nome_isael = INSTRUTOR_COMPARTILHADO["nome"]
    existe_instrutor = db.scalar(
        select(Instrutor).where(func.lower(Instrutor.nome) == nome_isael.lower())
    )
    if not existe_instrutor:
        db.add(
            Instrutor(
                nome=nome_isael,
                iniciais=INSTRUTOR_COMPARTILHADO["iniciais"],
            )
        )
        instrutor_criado = True

    db.commit()
    return {
        "logins": criados,
        "instrutor": [nome_isael] if instrutor_criado else [],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Dados de demonstração do Gestor SENAI")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Apaga as tabelas e recria os dados do zero.",
    )
    args = parser.parse_args()

    if args.reset:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
    else:
        criar_banco()

    with SessionLocal() as db:
        criado = semear(db)
        extras = garantir_contas_grupo(db)

    if criado:
        print("Seed aplicado.")
        print("  Aluno:       matrícula 202604178821 | senha senai123")
        print("  Coordenação: matrícula coord01      | senha senai123")
    else:
        print("O banco já possui usuários. Use --reset para recriar.")

    if extras["logins"]:
        print("Contas do grupo criadas: " + ", ".join(extras["logins"]))
        print("  Senha inicial: senai123 (altere no perfil)")
    if extras["instrutor"]:
        print("Instrutor criado: " + ", ".join(extras["instrutor"]))


if __name__ == "__main__":
    main()
