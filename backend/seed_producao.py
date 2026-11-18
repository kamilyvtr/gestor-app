"""Popula o banco de PRODUÇÃO (Neon / PostgreSQL) com os usuários de teste.

Uso (no seu terminal LOCAL, dentro da pasta ``backend/``)::

    # PowerShell
    $env:DATABASE_URL="postgresql://usuario:senha@host.neon.tech/gestor_senai?sslmode=require"
    python seed_producao.py

    # CMD
    set DATABASE_URL=postgresql://usuario:senha@host.neon.tech/gestor_senai?sslmode=require
    python seed_producao.py

    # Git Bash / Bash
    DATABASE_URL="postgresql://usuario:senha@host.neon.tech/gestor_senai?sslmode=require" \
        python seed_producao.py

O script é **idempotente**: cria as tabelas que faltarem e só insere os usuários
que ainda não existem. Nunca apaga dados.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))


def _preparar_database_url() -> str:
    # Permite também definir DATABASE_URL no backend/.env (se existir).
    try:
        from dotenv import load_dotenv

        load_dotenv(BASE_DIR / ".env")
    except Exception:  # pragma: no cover - dotenv é opcional aqui
        pass

    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        sys.exit(
            "ERRO: a variável de ambiente DATABASE_URL não está definida.\n\n"
            "Defina a connection string do Neon antes de rodar o script. Exemplos:\n"
            '  PowerShell: $env:DATABASE_URL="postgresql://...?sslmode=require"\n'
            '  CMD:        set DATABASE_URL=postgresql://...?sslmode=require\n'
            '  Bash:       DATABASE_URL="postgresql://...?sslmode=require" python seed_producao.py\n'
        )

    # SQLAlchemy 2.0 exige o esquema "postgresql://" (Neon às vezes entrega "postgres://").
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    os.environ["DATABASE_URL"] = url
    return url


DATABASE_URL = _preparar_database_url()

# IMPORTANTE: importar o app só depois de definir DATABASE_URL,
# porque app.config/app.database leem a variável no momento do import.
from sqlalchemy import func, select  # noqa: E402

from app.database import SessionLocal, criar_banco  # noqa: E402
from app.models import Aluno, Usuario  # noqa: E402
from app.security import gerar_hash_senha  # noqa: E402
from app.seed import SENHA_DEMO, semear  # noqa: E402


def _destino_seguro(url: str) -> str:
    """Mostra apenas o host/banco, escondendo usuário e senha."""
    return url.rsplit("@", 1)[-1] if "@" in url else "(sem credenciais na URL)"


def _contar_usuarios(db) -> int:
    return int(db.scalar(select(func.count()).select_from(Usuario)) or 0)


def _garantir_usuario(
    db,
    *,
    matricula: str,
    nome: str,
    nome_completo: str,
    iniciais: str,
    papel: str,
    curso: str | None = None,
    unidade: str | None = None,
    turno: str | None = None,
) -> bool:
    """Insere o usuário apenas se a matrícula ainda não existir.

    Retorna True quando criou e False quando já existia (idempotência).
    """
    if db.scalar(select(Usuario).where(Usuario.matricula == matricula)):
        print(f"  = {matricula} já existe — ignorado")
        return False

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

    if papel == "aluno":
        db.add(
            Aluno(
                usuario=usuario,
                curso=curso or "Técnico em Automação Industrial",
                unidade=unidade or "SENAI · Automação",
                turno=turno or "Tarde",
            )
        )
        db.flush()

    print(f"  + {matricula} criado (papel={papel})")
    return True


def main() -> None:
    print("Conectando ao banco de produção...")
    print(f"  destino: {_destino_seguro(DATABASE_URL)}")
    if DATABASE_URL.startswith("sqlite"):
        print("  ATENÇÃO: DATABASE_URL aponta para SQLite local (não para o Neon).")

    # Cria as tabelas que ainda não existirem — não apaga nada.
    criar_banco()
    print("  tabelas verificadas/criadas.")

    with SessionLocal() as db:
        total = _contar_usuarios(db)
        print(f"  usuários existentes: {total}")

        if total == 0:
            print("Banco vazio — aplicando o seed de demonstração completo...")
            if semear(db):
                print("  seed de demonstração aplicado (usuários, salas, aulas e avisos).")
        else:
            print("Banco já possui dados — garantindo apenas os usuários de teste...")
            _garantir_usuario(
                db,
                matricula="coord01",
                nome="Coordenação",
                nome_completo="Coordenação Pedagógica",
                iniciais="CP",
                papel="coordenacao",
            )
            _garantir_usuario(
                db,
                matricula="202604178821",
                nome="João Vitor",
                nome_completo="João Vitor Almeida",
                iniciais="JV",
                papel="aluno",
                curso="Técnico em Automação Industrial",
                unidade="SENAI · Automação",
                turno="Tarde",
            )
            db.commit()

    print()
    print("Concluído. Credenciais de acesso:")
    print(f"  Aluno:       matrícula 202604178821 | senha {SENHA_DEMO}")
    print(f"  Coordenação: matrícula coord01      | senha {SENHA_DEMO}")


if __name__ == "__main__":
    main()
