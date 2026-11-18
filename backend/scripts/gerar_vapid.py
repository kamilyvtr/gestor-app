"""Gera um par de chaves VAPID para Web Push.

Uso (a partir de backend/):
    python scripts/gerar_vapid.py

Saída:
    .vapid/private_key.pem   (nunca versione este arquivo)
    .vapid/public_key.txt    (chave pública em base64url, usada pelo navegador)
"""

from __future__ import annotations

import base64
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / ".vapid"
PRIVADA = PASTA / "private_key.pem"
PUBLICA = PASTA / "public_key.txt"


def main() -> None:
    PASTA.mkdir(parents=True, exist_ok=True)

    chave = ec.generate_private_key(ec.SECP256R1())
    pem = chave.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    publica = chave.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    publica_b64 = base64.urlsafe_b64encode(publica).rstrip(b"=").decode("ascii")

    PRIVADA.write_bytes(pem)
    PUBLICA.write_text(publica_b64, encoding="utf-8")

    print("Chaves VAPID geradas.")
    print(f"  Privada: {PRIVADA}")
    print(f"  Pública: {PUBLICA}")
    print(f"  applicationServerKey: {publica_b64}")


if __name__ == "__main__":
    main()
