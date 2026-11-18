"""Canal de tempo real (SSE) em memória.

Cada aluno conectado tem uma ou mais filas asyncio. Como os endpoints de
escrita podem rodar no threadpool do FastAPI, `publicar` agenda a entrega no
loop principal com `call_soon_threadsafe`.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any


class Broker:
    def __init__(self) -> None:
        self._filas: dict[int, set[asyncio.Queue]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def vincular_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def assinar(self, aluno_id: int) -> asyncio.Queue:
        fila: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._filas[aluno_id].add(fila)
        return fila

    def cancelar(self, aluno_id: int, fila: asyncio.Queue) -> None:
        filas = self._filas.get(aluno_id)
        if not filas:
            return
        filas.discard(fila)
        if not filas:
            self._filas.pop(aluno_id, None)

    def publicar_agora(self, aluno_id: int, evento: str, dados: dict[str, Any]) -> None:
        item = {"evento": evento, "dados": dados}
        for fila in list(self._filas.get(aluno_id, ())):
            try:
                fila.put_nowait(item)
            except asyncio.QueueFull:
                # Cliente lento: descarta o evento mais antigo e tenta de novo.
                try:
                    fila.get_nowait()
                    fila.put_nowait(item)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    def publicar(self, aluno_id: int, evento: str, dados: dict[str, Any]) -> None:
        loop = self._loop
        if loop and not loop.is_closed() and loop.is_running():
            loop.call_soon_threadsafe(self.publicar_agora, aluno_id, evento, dados)
        else:
            self.publicar_agora(aluno_id, evento, dados)

    def publicar_para_todos(self, evento: str, dados: dict[str, Any]) -> None:
        for aluno_id in list(self._filas):
            self.publicar(aluno_id, evento, dados)

    @property
    def total_conexoes(self) -> int:
        return sum(len(filas) for filas in self._filas.values())


broker = Broker()
