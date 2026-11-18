from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.config import settings


def _configurar_vapid(monkeypatch, tmp_path) -> None:
    privada = tmp_path / "private_key.pem"
    privada.write_text("chave-de-teste", encoding="utf-8")
    monkeypatch.setattr(settings, "vapid_public_key", "chave-publica-de-teste")
    monkeypatch.setattr(settings, "vapid_private_key_path", privada)


def test_chave_publica_e_inscricao(
    client: TestClient,
    headers_aluno: dict,
    monkeypatch,
    tmp_path,
) -> None:
    _configurar_vapid(monkeypatch, tmp_path)

    chave = client.get("/push/chave-publica")
    assert chave.status_code == 200
    assert chave.json()["publicKey"] == "chave-publica-de-teste"

    payload = {
        "endpoint": "https://push.example.com/sub/abc123",
        "keys": {"p256dh": "BOrn9chave-publica-do-navegador", "auth": "auth-secreta"},
    }
    inscricao = client.post("/push/inscrever", headers=headers_aluno, json=payload)
    assert inscricao.status_code == 201, inscricao.text
    primeira = inscricao.json()
    assert primeira["endpoint"] == payload["endpoint"]

    # Reinscrever o mesmo endpoint atualiza a assinatura em vez de duplicar.
    atualizada = client.post("/push/inscrever", headers=headers_aluno, json=payload)
    assert atualizada.status_code == 201
    assert atualizada.json()["id"] == primeira["id"]

    cancelada = client.delete(
        "/push/cancelar",
        headers=headers_aluno,
        params={"endpoint": payload["endpoint"]},
    )
    assert cancelada.status_code == 204

    novamente = client.delete(
        "/push/cancelar",
        headers=headers_aluno,
        params={"endpoint": payload["endpoint"]},
    )
    assert novamente.status_code == 404


def test_envio_de_push_de_teste(
    client: TestClient,
    headers_aluno: dict,
    monkeypatch,
    tmp_path,
) -> None:
    _configurar_vapid(monkeypatch, tmp_path)
    chamadas: list[dict] = []

    def fake_webpush(**kwargs):
        chamadas.append(kwargs)
        return SimpleNamespace(status_code=201)

    monkeypatch.setattr("app.services.push.webpush", fake_webpush)

    client.post(
        "/push/inscrever",
        headers=headers_aluno,
        json={
            "endpoint": "https://push.example.com/sub/teste",
            "keys": {"p256dh": "BOrn9chave-publica-do-navegador", "auth": "auth-secreta"},
        },
    )

    resposta = client.post(
        "/push/teste",
        headers=headers_aluno,
        json={"titulo": "Olá", "corpo": "Teste", "url": "./index.html#avisos"},
    )
    assert resposta.status_code == 200, resposta.text
    resultado = resposta.json()["resultado"]
    assert resultado["enviados"] == 1
    assert resultado["configurado"] is True
    assert len(chamadas) == 1
    assert chamadas[0]["subscription_info"]["endpoint"].endswith("/teste")


def test_push_sem_chaves_configuradas(
    client: TestClient, headers_aluno: dict, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "vapid_public_key", "")

    assert client.get("/push/chave-publica").status_code == 503
    assert client.post("/push/teste", headers=headers_aluno).status_code == 503
