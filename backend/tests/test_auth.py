from __future__ import annotations

from fastapi.testclient import TestClient


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_alterar_senha_exige_senha_atual(client: TestClient) -> None:
    login = client.post(
        "/auth/login", json={"matricula": "202604178821", "senha": "senai123"}
    )
    assert login.status_code == 200
    headers = _headers(login.json()["access_token"])

    errada = client.post(
        "/auth/senha",
        headers=headers,
        json={"senhaAtual": "nao-e-essa", "novaSenha": "novaSenha123"},
    )
    assert errada.status_code == 400

    curta = client.post(
        "/auth/senha",
        headers=headers,
        json={"senhaAtual": "senai123", "novaSenha": "123"},
    )
    assert curta.status_code == 422

    trocada = client.post(
        "/auth/senha",
        headers=headers,
        json={"senhaAtual": "senai123", "novaSenha": "novaSenha123"},
    )
    assert trocada.status_code == 204

    antiga = client.post(
        "/auth/login", json={"matricula": "202604178821", "senha": "senai123"}
    )
    assert antiga.status_code == 401

    nova = client.post(
        "/auth/login",
        json={"matricula": "202604178821", "senha": "novaSenha123"},
    )
    assert nova.status_code == 200
    assert nova.json()["usuario"]["papel"] == "aluno"


def test_aluno_nao_acessa_rotas_da_coordenacao(
    client: TestClient, headers_aluno: dict
) -> None:
    assert client.get("/dashboard/resumo", headers=headers_aluno).status_code == 403
    assert (
        client.post(
            "/dashboard/instrutores",
            headers=headers_aluno,
            json={"nome": "Sem Permissão", "iniciais": "SP"},
        ).status_code
        == 403
    )
    assert (
        client.delete("/dashboard/aulas/aula-clp-14", headers=headers_aluno).status_code
        == 403
    )
