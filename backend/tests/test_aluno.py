from __future__ import annotations

from fastapi.testclient import TestClient


def test_perfil(client: TestClient, headers_aluno: dict) -> None:
    resposta = client.get("/aluno/perfil", headers=headers_aluno)
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["nome"] == "João Vitor"
    assert corpo["matricula"] == "202604178821"
    assert corpo["curso"] == "Técnico em Automação Industrial"
    assert set(corpo) == {
        "nome",
        "nomeCompleto",
        "iniciais",
        "matricula",
        "curso",
        "unidade",
        "turno",
    }


def test_agenda_contrato(client: TestClient, headers_aluno: dict) -> None:
    resposta = client.get("/aluno/agenda", headers=headers_aluno)
    assert resposta.status_code == 200
    dados = resposta.json()

    assert dados["aluno"]["nome"] == "João Vitor"
    assert len(dados["dias"]) == 7
    assert dados["proximaAulaId"]

    aulas = [aula for dia in dados["dias"] for aula in dia["aulas"]]
    assert aulas
    clp = next(aula for aula in aulas if aula["id"] == "aula-clp-14")
    assert clp["sala"] == "Lab 05"
    assert clp["salaAnterior"] == "Lab 04"
    assert clp["alterada"] is True
    assert clp["duracao"] == "2h"
    assert clp["instrutor"] == "Rafael Lima"
    assert clp["direcoes"]

    assert dados["alerta"]["aulaId"] == "aula-clp-14"
    assert "Lab 05" in dados["alerta"]["texto"]
    assert dados["alerta"]["hora"] in {"agora", "há 10 min"}

    nao_lidos = [aviso for aviso in dados["avisos"] if not aviso["lida"]]
    assert len(nao_lidos) == 3
    assert any(aviso["tipo"] == "sala" for aviso in dados["avisos"])
    assert any(aviso["id"] == "aviso-global-lab04" and aviso["lida"] for aviso in dados["avisos"])


def test_marcar_aviso_lido(client: TestClient, headers_aluno: dict) -> None:
    avisos = client.get("/aluno/avisos", headers=headers_aluno).json()
    nao_lido = next(aviso for aviso in avisos if not aviso["lida"])

    resposta = client.post(
        f"/aluno/avisos/{nao_lido['id']}/ler", headers=headers_aluno
    )
    assert resposta.status_code == 200
    assert resposta.json()["lida"] is True

    restantes = client.get(
        "/aluno/avisos?apenas_nao_lidos=true", headers=headers_aluno
    ).json()
    assert len(restantes) == 2


def test_marcar_todos_lidos(client: TestClient, headers_aluno: dict) -> None:
    resposta = client.post("/aluno/avisos/ler-todos", headers=headers_aluno)
    assert resposta.status_code == 200
    assert resposta.json()["atualizados"] == 3

    restantes = client.get(
        "/aluno/avisos?apenas_nao_lidos=true", headers=headers_aluno
    ).json()
    assert restantes == []


def test_aviso_inexistente(client: TestClient, headers_aluno: dict) -> None:
    resposta = client.post("/aluno/avisos/nao-existe/ler", headers=headers_aluno)
    assert resposta.status_code == 404


def test_aluno_nao_acessa_dashboard(
    client: TestClient, headers_aluno: dict
) -> None:
    resposta = client.get("/dashboard/resumo", headers=headers_aluno)
    assert resposta.status_code == 403
