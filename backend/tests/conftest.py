from __future__ import annotations

import os

# Precisam ser definidas antes de importar app.config.
os.environ["AMBIENTE"] = "test"
os.environ["JWT_SECRET"] = "segredo-de-teste-com-mais-de-32-bytes-123456"
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SENHA_ITERACOES"] = "1000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import semear  # noqa: E402

MATRICULA_ALUNO = "202604178821"
MATRICULA_COORD = "coord01"
SENHA = "senai123"

engine_teste = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(engine_teste, "connect")
def _fk_sqlite(conexao_dbapi, _registro) -> None:
    cursor = conexao_dbapi.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine_teste)
    Base.metadata.create_all(bind=engine_teste)
    SessionTeste = sessionmaker(
        bind=engine_teste, autoflush=False, expire_on_commit=False
    )
    with SessionTeste() as db:
        assert semear(db) is True

    def override_get_db():
        db = SessionTeste()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    cliente = TestClient(app)
    try:
        yield cliente
    finally:
        cliente.close()
        app.dependency_overrides.clear()


def _login(client: TestClient, matricula: str) -> dict:
    resposta = client.post(
        "/auth/login", json={"matricula": matricula, "senha": SENHA}
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


@pytest.fixture()
def aluno_login(client: TestClient) -> dict:
    return _login(client, MATRICULA_ALUNO)


@pytest.fixture()
def coord_login(client: TestClient) -> dict:
    return _login(client, MATRICULA_COORD)


@pytest.fixture()
def headers_aluno(aluno_login: dict) -> dict:
    return {"Authorization": f"Bearer {aluno_login['access_token']}"}


@pytest.fixture()
def headers_coord(coord_login: dict) -> dict:
    return {"Authorization": f"Bearer {coord_login['access_token']}"}
