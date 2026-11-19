from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import SessionLocal, criar_banco
from .routers import aluno, auth, dashboard, eventos, push
from .seed import garantir_contas_grupo, semear
from .services.broker import broker
from .tempo import agora_utc

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("gestor_senai")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info(
        "Diagnóstico de configuração | DATABASE_URL configurada: %s",
        bool(settings.database_url),
    )
    logger.info(
        "Diagnóstico de configuração | JWT_SECRET configurada: %s",
        bool(settings.jwt_secret),
    )
    logger.info("Diagnóstico de configuração | CORS origens: %s", origins)
    logger.info(
        "Diagnóstico de configuração | AMBIENTE: %s",
        settings.ambiente,
    )
    logger.info(
        "Diagnóstico de configuração | Web Push: %s | chave privada: %s",
        "configurado" if settings.vapid_configurado else "NÃO configurado",
        settings.vapid_origem_chave,
    )

    criar_banco()

    if settings.seed_on_startup:
        with SessionLocal() as db:
            if semear(db):
                logger.info(
                    "Seed de demonstração aplicado (aluno 202604178821 / coord01)."
                )
            extras = garantir_contas_grupo(db)
            if extras["logins"]:
                logger.info(
                    "Contas do grupo criadas: %s", ", ".join(extras["logins"])
                )
            if extras["instrutor"]:
                logger.info("Instrutor criado: %s", ", ".join(extras["instrutor"]))

    broker.vincular_loop(asyncio.get_running_loop())

    if settings.jwt_secret == "troque-esta-chave-em-producao":
        logger.warning(
            "JWT_SECRET padrão em uso. Defina uma chave forte em backend/.env antes de publicar."
        )
    if not settings.vapid_configurado:
        logger.error(
            "Web Push DESATIVADO (chave privada %s). O aluno pode conceder permissão "
            "no aparelho, mas o servidor não consegue enviar. Em produção defina "
            "VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (PEM completo) nas variáveis de "
            "ambiente; em desenvolvimento rode python scripts/gerar_vapid.py.",
            settings.vapid_origem_chave,
        )

    logger.info(
        "Gestor SENAI API pronta | ambiente=%s | banco=%s",
        settings.ambiente,
        settings.database_url,
    )
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.versao,
    description=(
        "API do Gestor SENAI: agenda do aluno, avisos, tempo real (SSE), "
        "painel da coordenação e notificações Web Push."
    ),
    lifespan=lifespan,
)

# CORS: o front-end usa `credentials: 'include'`, então as origens precisam ser
# explícitas (o navegador rejeita "*" em requisições com credenciais).
origins = [
    "https://gestor-app-backend-fpbt2hhvk-kamilyvtrs-projects.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    # Origens extras configuradas no .env / no painel do Render.
    *settings.cors_origins,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Cobre o domínio de produção e todos os previews futuros da Vercel.
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth.router)
app.include_router(aluno.router)
app.include_router(eventos.router)
app.include_router(dashboard.router)
app.include_router(push.router)


@app.get("/", tags=["Diagnóstico"])
def raiz() -> dict:
    return {
        "app": settings.app_name,
        "versao": settings.versao,
        "ambiente": settings.ambiente,
        "docs": "/docs",
        "openapi": "/openapi.json",
        "health": "/health",
    }


@app.get("/health", tags=["Diagnóstico"])
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "versao": settings.versao,
        "ambiente": settings.ambiente,
        "hora": agora_utc(),
        "web_push": settings.vapid_configurado,
        "sse_conexoes": broker.total_conexoes,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
