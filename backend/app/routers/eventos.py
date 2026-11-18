from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import aluno_atual
from ..models import Aluno
from ..services.broker import broker

router = APIRouter(prefix="/aluno", tags=["Aluno"])

CABECALHOS_SSE = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.get("/eventos", summary="Canal de tempo real (Server-Sent Events)")
async def eventos(
    request: Request,
    aluno: Aluno = Depends(aluno_atual),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    aluno_id = aluno.id
    # A sessão não é necessária durante o stream; libera a conexão do pool.
    db.close()

    fila = broker.assinar(aluno_id)

    async def gerar():
        try:
            yield "retry: 3000\n\n"
            yield 'event: conectado\ndata: {"ok": true}\n\n'
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(fila.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue

                dados = json.dumps(item["dados"], ensure_ascii=False)
                yield f"event: {item['evento']}\ndata: {dados}\n\n"
        finally:
            broker.cancelar(aluno_id, fila)

    return StreamingResponse(
        gerar(), media_type="text/event-stream", headers=CABECALHOS_SSE
    )
