#!/usr/bin/env python3
"""
Servidor local de desenvolvimento — Gestor SENAI.

O Service Worker, o manifest e as notificações exigem HTTP/HTTPS.
Este servidor envia UTF-8 explicitamente e desativa cache do navegador.

Uso:
    python serve.py            # http://localhost:8080
    python serve.py 5500       # outra porta

Para testar no celular na mesma rede Wi-Fi, use o endereço de rede
mostrado no terminal (ex.: http://192.168.0.10:8080).

Observação: Service Worker e notificações só funcionam em contexto seguro
(HTTPS ou localhost). Em HTTP na LAN o app abre, mas não instala como PWA
nem registra o Service Worker; para o teste completo use um túnel HTTPS
(ex.: cloudflared/ngrok) ou o port forwarding do Chrome DevTools.
"""

from __future__ import annotations

import http.server
import socket
import socketserver
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

EXTENSOES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTENSOES}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, formato, *args):
        print(f"  {self.address_string()}  {formato % args}")


def ip_local() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main() -> None:
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.ThreadingTCPServer(("0.0.0.0", PORTA), Handler) as servidor:
        print("\n  Gestor SENAI — servidor de desenvolvimento")
        print(f"  Pasta: {RAIZ}")
        print(f"  Local:   http://localhost:{PORTA}")
        print(f"  Rede:    http://{ip_local()}:{PORTA}  (celular na mesma Wi-Fi)")
        print("           Obs.: instalação/PWA exige HTTPS ou localhost no celular.")
        print(f"  Painel:  http://localhost:{PORTA}/dashboard.html")
        print("  Encerre com Ctrl+C.\n")

        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print("\n  Servidor encerrado.\n")


if __name__ == "__main__":
    main()
