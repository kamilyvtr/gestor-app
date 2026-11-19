from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient


def _sala_id(salas: list[dict], nome: str) -> int:
    return next(sala["id"] for sala in salas if sala["nome"] == nome)


def test_dashboard_exige_coordenacao(client: TestClient) -> None:
    assert client.get("/dashboard/resumo").status_code == 401


def test_resumo_do_dia(client: TestClient, headers_coord: dict) -> None:
    resposta = client.get("/dashboard/resumo", headers=headers_coord)
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["aulasHoje"] == 10
    assert corpo["labsEmUso"] == 4
    assert corpo["totalLabs"] == 4
    assert corpo["ocupacaoPercent"] == 100
    assert corpo["conflitos"] >= 1


def test_salas_alunos_e_instrutores(
    client: TestClient, headers_coord: dict
) -> None:
    salas = client.get("/dashboard/salas", headers=headers_coord).json()
    alunos = client.get("/dashboard/alunos", headers=headers_coord).json()
    instrutores = client.get("/dashboard/instrutores", headers=headers_coord).json()

    assert len(salas) == 6
    assert {sala["nome"] for sala in salas} >= {"Lab 02", "Lab 05", "Sala 03"}
    assert len(alunos) == 3
    assert any(aluno["nome"] == "João Vitor" for aluno in alunos)
    assert len(instrutores) == 3


def test_alocacoes_da_semana(client: TestClient, headers_coord: dict) -> None:
    resposta = client.get("/dashboard/alocacoes", headers=headers_coord)
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert len(corpo["dias"]) == 6
    assert corpo["inicio"] <= corpo["fim"]
    aulas = [aula for dia in corpo["dias"] for aula in dia["aulas"]]
    assert aulas
    assert all(aula["aluno"] for aula in aulas)


def test_conflito_de_sala_detectado(
    client: TestClient, headers_coord: dict
) -> None:
    resposta = client.get("/dashboard/conflitos", headers=headers_coord)
    assert resposta.status_code == 200
    conflitos = resposta.json()
    assert any(
        conflito["tipo"] == "sala" and conflito["recurso"] == "Lab 03"
        for conflito in conflitos
    )


def test_mudanca_de_sala_atualiza_aula_aviso_e_alerta(
    client: TestClient, headers_coord: dict, headers_aluno: dict
) -> None:
    salas = client.get("/dashboard/salas", headers=headers_coord).json()
    lab02 = _sala_id(salas, "Lab 02")

    resposta = client.post(
        "/dashboard/mudanca-sala",
        headers=headers_coord,
        json={
            "aulaId": "aula-clp-14",
            "novaSalaId": lab02,
            "mensagem": "Aviso enviado pela coordenação.",
        },
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["aula"]["sala"] == "Lab 02"
    assert corpo["aula"]["salaAnterior"] == "Lab 05"
    assert corpo["aula"]["alterada"] is True
    assert corpo["evento"]["novaSala"] == "Lab 02"
    assert corpo["evento"]["salaAnterior"] == "Lab 05"
    assert corpo["aviso"]["tipo"] == "sala"
    assert corpo["aviso"]["lida"] is False
    assert "Lab 02" in corpo["aviso"]["texto"]

    agenda = client.get("/aluno/agenda", headers=headers_aluno).json()
    assert "Lab 02" in agenda["alerta"]["texto"]
    assert agenda["alerta"]["hora"] == "agora"
    nao_lidos = [aviso for aviso in agenda["avisos"] if not aviso["lida"]]
    assert len(nao_lidos) == 4


def test_mudanca_de_sala_bloqueia_conflito(
    client: TestClient, headers_coord: dict
) -> None:
    salas = client.get("/dashboard/salas", headers=headers_coord).json()
    lab03 = _sala_id(salas, "Lab 03")

    resposta = client.post(
        "/dashboard/mudanca-sala",
        headers=headers_coord,
        json={"aulaId": "aula-clp-14", "novaSalaId": lab03},
    )
    assert resposta.status_code == 409
    detalhe = resposta.json()["detail"]
    assert detalhe["tipo"] == "sala"
    assert detalhe["conflito"]["sala"] == "Lab 03"


def test_mudanca_para_a_mesma_sala(
    client: TestClient, headers_coord: dict
) -> None:
    salas = client.get("/dashboard/salas", headers=headers_coord).json()
    lab05 = _sala_id(salas, "Lab 05")

    resposta = client.post(
        "/dashboard/mudanca-sala",
        headers=headers_coord,
        json={"aulaId": "aula-clp-14", "novaSalaId": lab05},
    )
    assert resposta.status_code == 400


def test_criar_aula_e_impedir_choque(
    client: TestClient, headers_coord: dict
) -> None:
    alunos = client.get("/dashboard/alunos", headers=headers_coord).json()
    salas = client.get("/dashboard/salas", headers=headers_coord).json()
    instrutores = client.get("/dashboard/instrutores", headers=headers_coord).json()

    payload = {
        "alunoId": alunos[0]["id"],
        "salaId": _sala_id(salas, "Lab 02"),
        "instrutorId": instrutores[0]["id"],
        "data": (date.today() + timedelta(days=5)).isoformat(),
        "inicio": "08:00",
        "fim": "09:30",
        "titulo": "Aula de teste",
        "subtitulo": "Alocação via API",
        "tipo": "prática",
    }

    criada = client.post("/dashboard/aulas", headers=headers_coord, json=payload)
    assert criada.status_code == 200, criada.text
    assert criada.json()["titulo"] == "Aula de teste"
    assert criada.json()["aluno"]

    repetida = client.post("/dashboard/aulas", headers=headers_coord, json=payload)
    assert repetida.status_code == 409


def test_avisos_recentes_do_painel(
    client: TestClient, headers_coord: dict, headers_aluno: dict
) -> None:
    resposta = client.get("/dashboard/avisos", headers=headers_coord)
    assert resposta.status_code == 200, resposta.text
    avisos = resposta.json()
    assert len(avisos) >= 4
    assert avisos[0]["titulo"] == "Mudança de sala"
    assert avisos[0]["destinatario"] == "João Vitor"
    assert any(
        aviso["destinatario"] == "Todos os alunos" for aviso in avisos
    )
    assert all("quando" in aviso for aviso in avisos)

    # Coordenação apenas.
    assert client.get("/dashboard/avisos", headers=headers_aluno).status_code == 403


def test_publicar_aviso_global(
    client: TestClient, headers_coord: dict, headers_aluno: dict
) -> None:
    resposta = client.post(
        "/dashboard/avisos",
        headers=headers_coord,
        json={
            "titulo": "Aviso global de teste",
            "texto": "Conteúdo do aviso global.",
            "tipo": "sistema",
            "enviarPush": False,
        },
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["destinatarios"] == 3
    assert corpo["aviso"]["titulo"] == "Aviso global de teste"

    agenda = client.get("/aluno/agenda", headers=headers_aluno).json()
    aviso = next(
        aviso for aviso in agenda["avisos"] if aviso["id"] == corpo["aviso"]["id"]
    )
    assert aviso["lida"] is False


def test_criar_instrutor_e_bloquear_duplicidade(
    client: TestClient, headers_coord: dict
) -> None:
    resposta = client.post(
        "/dashboard/instrutores",
        headers=headers_coord,
        json={"nome": "Isael Lima", "iniciais": "IL"},
    )
    assert resposta.status_code == 201, resposta.text
    assert resposta.json()["nome"] == "Isael Lima"
    assert resposta.json()["iniciais"] == "IL"

    repetido = client.post(
        "/dashboard/instrutores",
        headers=headers_coord,
        json={"nome": "isael lima", "iniciais": "IL"},
    )
    assert repetido.status_code == 400

    assert client.post(
        "/dashboard/instrutores",
        headers={"Authorization": "Bearer invalido"},
        json={"nome": "Outro", "iniciais": "OU"},
    ).status_code == 401


def test_editar_e_excluir_aula(
    client: TestClient, headers_coord: dict
) -> None:
    grade = client.get("/dashboard/alocacoes", headers=headers_coord).json()
    aula = next(
        aula
        for dia in grade["dias"]
        for aula in dia["aulas"]
        if aula["id"] == "aula-clp-14"
    )
    salas = client.get("/dashboard/salas", headers=headers_coord).json()
    instrutores = client.get("/dashboard/instrutores", headers=headers_coord).json()
    lab02 = _sala_id(salas, "Lab 02")

    resposta = client.patch(
        f"/dashboard/aulas/{aula['id']}",
        headers=headers_coord,
        json={
            "salaId": lab02,
            "titulo": "Automação Industrial (revisada)",
            "subtitulo": "Ajuste da coordenação",
            "notificar": True,
        },
    )
    assert resposta.status_code == 200, resposta.text
    editada = resposta.json()
    assert editada["sala"] == "Lab 02"
    assert editada["titulo"] == "Automação Industrial (revisada)"

    # A edição com notificação cria um aviso real para o aluno.
    avisos = client.get("/dashboard/avisos?limite=50", headers=headers_coord).json()
    assert any(aviso["titulo"] == "Aula atualizada" for aviso in avisos)

    remocao = client.delete(
        f"/dashboard/aulas/{aula['id']}", headers=headers_coord
    )
    assert remocao.status_code == 204
    grade = client.get("/dashboard/alocacoes", headers=headers_coord).json()
    assert not any(
        item["id"] == aula["id"]
        for dia in grade["dias"]
        for item in dia["aulas"]
    )


def test_editar_e_excluir_aviso(
    client: TestClient, headers_coord: dict, headers_aluno: dict
) -> None:
    avisos = client.get("/dashboard/avisos", headers=headers_coord).json()
    global_ = next(a for a in avisos if a["destinatario"] == "Todos os alunos")

    resposta = client.patch(
        f"/dashboard/avisos/{global_['id']}",
        headers=headers_coord,
        json={"titulo": "Comunicado atualizado", "texto": "Novo conteúdo."},
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["titulo"] == "Comunicado atualizado"

    agenda = client.get("/aluno/agenda", headers=headers_aluno).json()
    atualizado = next(
        aviso for aviso in agenda["avisos"] if aviso["id"] == global_["id"]
    )
    assert atualizado["titulo"] == "Comunicado atualizado"

    remocao = client.delete(
        f"/dashboard/avisos/{global_['id']}", headers=headers_coord
    )
    assert remocao.status_code == 204
    agenda = client.get("/aluno/agenda", headers=headers_aluno).json()
    assert all(aviso["id"] != global_["id"] for aviso in agenda["avisos"])


def test_contas_do_grupo_sao_idempotentes(client: TestClient, db_teste) -> None:
    from sqlalchemy import func, select

    from app.models import Aluno, Instrutor, Usuario
    from app.seed import garantir_contas_grupo

    db = db_teste
    antes = db.scalar(select(func.count()).select_from(Usuario))
    primeira = garantir_contas_grupo(db)
    segunda = garantir_contas_grupo(db)
    depois = db.scalar(select(func.count()).select_from(Usuario))

    assert sorted(primeira["logins"]) == [
        "202601",
        "202602",
        "202603",
        "202604",
        "202607",
    ]
    assert segunda["logins"] == []
    assert segunda["instrutor"] == []
    assert depois == antes + 5
    for login in primeira["logins"]:
        usuario = db.scalar(select(Usuario).where(Usuario.matricula == login))
        assert usuario is not None
        assert usuario.papel == "aluno"
        assert db.scalar(
            select(func.count())
            .select_from(Aluno)
            .where(Aluno.usuario_id == usuario.id)
        ) == 1
    assert db.scalar(
        select(func.count())
        .select_from(Instrutor)
        .where(func.lower(Instrutor.nome) == "isael lima")
    ) == 1


def test_notificacoes_reunem_conflitos_e_avisos(
    client: TestClient, headers_coord: dict
) -> None:
    resposta = client.get("/dashboard/notificacoes", headers=headers_coord)
    assert resposta.status_code == 200, resposta.text
    itens = resposta.json()
    assert itens
    assert any(item["tipo"] == "conflito" for item in itens)
    assert any(item["tipo"] == "aviso" for item in itens)
    assert all(item["referencia"] for item in itens)
