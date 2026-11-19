from __future__ import annotations

import base64
import binascii
import re
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


def _pem_para_base64url(pem: str) -> str | None:
    """Converte um PEM (EC P-256) no base64url que o pywebpush espera."""
    try:
        corpo = re.sub(r"-----BEGIN[^-]+-----|-----END[^-]+-----", "", pem)
        der = base64.b64decode("".join(corpo.split()), validate=True)
    except (binascii.Error, ValueError):
        return None
    return base64.urlsafe_b64encode(der).rstrip(b"=").decode()


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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _cors_origens_para_lista(cls, valor):
        """Render pode enviar CORS_ORIGINS como string simples (ex: 'https://site.com').

        Converte string separada por vírgula em lista; se já for lista, retorna como está.
        """
        if isinstance(valor, str):
            return [origem.strip() for origem in valor.split(",") if origem.strip()]
        if isinstance(valor, (list, tuple, set)):
            return [str(origem).strip() for origem in valor if str(origem).strip()]
        return valor

    # Web Push (VAPID)
    vapid_subject: str = "mailto:contato@gestorsenai.com.br"
    vapid_public_key: str = ""
    # Em produção (Render) o par de chaves vem por variável de ambiente:
    # VAPID_PRIVATE_KEY recebe o conteúdo PEM. O caminho em disco é o fallback
    # usado no desenvolvimento local.
    vapid_private_key: str = ""
    vapid_private_key_path: Path = BASE_DIR / ".vapid" / "private_key.pem"
    push_timeout: float = 10.0
    push_ttl: int = 3600

    @field_validator("vapid_public_key", "vapid_private_key", mode="before")
    @classmethod
    def _normalizar_chave_vapid(cls, valor):
        """Aceita a chave colada com aspas, espaços ou com \\n escapado.

        Painéis como o do Render entregam o PEM em uma linha só; sem essa
        normalização o pywebpush não consegue ler a chave.
        """
        if not isinstance(valor, str):
            return valor
        texto = valor.strip().strip('"').strip("'")
        if "\\n" in texto:
            texto = texto.replace("\\n", "\n")
        return texto

    @model_validator(mode="after")
    def carregar_vapid_do_arquivo(self) -> "Settings":
        if not self.vapid_public_key:
            arquivo = BASE_DIR / ".vapid" / "public_key.txt"
            if arquivo.exists():
                self.vapid_public_key = arquivo.read_text(encoding="utf-8").strip()
        return self

    @property
    def chave_privada_vapid(self) -> str | None:
        """Valor pronto para o pywebpush: caminho do PEM ou chave em base64url.

        O pywebpush aceita um arquivo PEM ou a chave em base64url (DER). Como o
        Render entrega o PEM por variável de ambiente (não há arquivo), a chave
        do ambiente é convertida para base64url aqui.
        """
        if self.vapid_private_key and "BEGIN" in self.vapid_private_key:
            return _pem_para_base64url(self.vapid_private_key)
        try:
            caminho = Path(self.vapid_private_key_path)
            if caminho.exists():
                conteudo = caminho.read_text(encoding="utf-8").strip()
                return str(caminho) if conteudo else None
        except OSError:
            return None
        return None

    @property
    def vapid_origem_chave(self) -> str:
        """De onde a chave privada está vindo — aparece nos logs de startup."""
        if self.vapid_private_key and "BEGIN" in self.vapid_private_key:
            return "env:VAPID_PRIVATE_KEY"
        if Path(self.vapid_private_key_path).exists():
            return "arquivo:.vapid/private_key.pem"
        return "ausente"

    @property
    def vapid_configurado(self) -> bool:
        return bool(self.vapid_public_key) and self.chave_privada_vapid is not None

    @property
    def eh_desenvolvimento(self) -> bool:
        return self.ambiente.lower() in {"dev", "development", "local"}

    @property
    def banco_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
