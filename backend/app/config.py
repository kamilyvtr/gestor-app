from __future__ import annotations

from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Configuração da API, carregada de variáveis de ambiente ou de backend/.env."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Gestor SENAI API"
    versao: str = "0.1.0"
    ambiente: str = "development"
    debug: bool = True

    # Banco de dados. SQLite por padrão; basta trocar a URL para PostgreSQL.
    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'gestor_senai.db').as_posix()}"

    # Autenticação JWT
    jwt_secret: str = "troque-esta-chave-em-producao"
    jwt_algoritmo: str = "HS256"
    jwt_expira_minutos: int = 480
    senha_iteracoes: int = 260_000
    cookie_name: str = "gestor_senai_token"
    cookie_secure: bool = False

    # CORS: origens exatas do front-end (credenciais exigem origem explícita)
    cors_origins: list[str] = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
    ]

    # Dados de demonstração
    seed_on_startup: bool = True

    # Web Push (VAPID)
    vapid_subject: str = "mailto:contato@gestorsenai.com.br"
    vapid_public_key: str = ""
    vapid_private_key_path: Path = BASE_DIR / ".vapid" / "private_key.pem"
    push_timeout: float = 10.0

    @model_validator(mode="after")
    def carregar_vapid_do_arquivo(self) -> "Settings":
        if not self.vapid_public_key:
            arquivo = BASE_DIR / ".vapid" / "public_key.txt"
            if arquivo.exists():
                self.vapid_public_key = arquivo.read_text(encoding="utf-8").strip()
        return self

    @property
    def vapid_configurado(self) -> bool:
        return bool(self.vapid_public_key) and self.vapid_private_key_path.exists()

    @property
    def eh_desenvolvimento(self) -> bool:
        return self.ambiente.lower() in {"dev", "development", "local"}

    @property
    def banco_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
