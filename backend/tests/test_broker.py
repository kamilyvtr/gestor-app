from __future__ import annotations

import asyncio

from app.services.broker import Broker


def test_broker_entrega_e_cancela() -> None:
    async def cenario() -> None:
        broker = Broker()
        fila = broker.assinar(7)

        broker.publicar_agora(7, "mudanca-sala", {"mensagem": "Agora é no Lab 05"})
        item = await asyncio.wait_for(fila.get(), timeout=1)

        assert item["evento"] == "mudanca-sala"
        assert item["dados"]["mensagem"] == "Agora é no Lab 05"
        assert broker.total_conexoes == 1

        broker.cancelar(7, fila)
        assert broker.total_conexoes == 0

    asyncio.run(cenario())


def test_broker_descarta_evento_antigo_quando_fila_cheia() -> None:
    async def cenario() -> None:
        broker = Broker()
        fila = broker.assinar(1)

        for indice in range(105):
            broker.publicar_agora(1, "aviso", {"indice": indice})

        assert fila.qsize() == 100
        primeiro = await asyncio.wait_for(fila.get(), timeout=1)
        assert primeiro["dados"]["indice"] == 5

        broker.cancelar(1, fila)

    asyncio.run(cenario())


def test_broker_publica_para_todos() -> None:
    async def cenario() -> None:
        broker = Broker()
        fila_a = broker.assinar(1)
        fila_b = broker.assinar(2)

        broker.publicar_para_todos("aviso", {"mensagem": "Para todos"})

        item_a = await asyncio.wait_for(fila_a.get(), timeout=1)
        item_b = await asyncio.wait_for(fila_b.get(), timeout=1)
        assert item_a["dados"]["mensagem"] == "Para todos"
        assert item_b["evento"] == "aviso"
        assert broker.total_conexoes == 2

        broker.cancelar(1, fila_a)
        broker.cancelar(2, fila_b)

    asyncio.run(cenario())
