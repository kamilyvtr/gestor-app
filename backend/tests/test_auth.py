from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    resposta = client.get("/health")
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "ok"
    assert "versao" in corpo


def test_login_aluno_e_cookie(client: TestClient) -> None:
    resposta = client.post(
        "/auth/login",
        json={"matricula": "202604178821", "senha": "senai123"},
    )
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["token_type"] == "bearer"
    assert corpo["usuario"]["nome"] == "João Vitor"
    assert corpo["usuario"]["papel"] == "aluno"
    assert "access_token" in corpo
    assert "gestor_senai_token" in client.cookies

    # Cookie HttpOnly autentica sem precisar do header Authorization.
    agenda = client.get("/aluno/agenda")
    assert agenda.status_code == 200


def test_login_invalido(client: TestClient) -> None:
    resposta = client.post(
        "/auth/login",
        json={"matricula": "202604178821", "senha": "errada"},
    )
    assert resposta.status_code == 401


def test_rota_protegida_sem_token(client: TestClient) -> None:
    resposta = client.get("/aluno/agenda")
    assert resposta.status_code == 401


def test_me_com_perfil(client: TestClient, aluno_login: dict) -> None:
    resposta = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {aluno_login['access_token']}"},
    )
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["usuario"]["matricula"] == "202604178821"
    assert corpo["perfil"]["turno"] == "Tarde"
    assert corpo["perfil"]["nomeCompleto"] == "João Vitor Almeida"
