from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import BASE_DIR, settings


class Base(DeclarativeBase):
    pass


if settings.banco_sqlite:
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)

connect_args = {"check_same_thread": False} if settings.banco_sqlite else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


if settings.banco_sqlite:

    @event.listens_for(engine, "connect")
    def _ativar_foreign_keys(conexao_dbapi, _registro) -> None:
        cursor = conexao_dbapi.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def criar_banco() -> None:
    """Cria as tabelas. Importa os modelos para registrar os metadados."""
    from . import models  # noqa: F401  (import necessário para o metadata)

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
