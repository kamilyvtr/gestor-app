from __future__ import annotations

from datetime import date, datetime, time, timezone


def agora_utc() -> datetime:
    """Agora em UTC, sem tzinfo, para armazenamento consistente no SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hoje_local() -> date:
    return date.today()


def hora_relativa(momento: datetime) -> str:
    """Texto curto usado pelo alerta do app (\"agora\", \"há 10 min\", ...)."""
    delta = agora_utc() - momento
    segundos = max(int(delta.total_seconds()), 0)

    if segundos < 60:
        return "agora"
    minutos = segundos // 60
    if minutos < 60:
        return f"há {minutos} min"
    horas = minutos // 60
    if horas < 24:
        return f"há {horas} h"
    return momento.strftime("%d/%m")


def formatar_duracao(inicio: time, fim: time) -> str:
    minutos = (fim.hour * 60 + fim.minute) - (inicio.hour * 60 + inicio.minute)
    horas, resto = divmod(max(minutos, 0), 60)
    if not horas:
        return f"{resto}min"
    if not resto:
        return f"{horas}h"
    return f"{horas}h{resto:02d}"
