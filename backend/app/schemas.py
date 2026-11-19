from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field


def para_camel(nome: str) -> str:
    primeira, *resto = nome.split("_")
    return primeira + "".join(parte.capitalize() for parte in resto)


class ModeloBase(BaseModel):
    model_config = ConfigDict(
        alias_generator=para_camel,
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
    )


# --------------------------------------------------------------------------
# Autenticação
# --------------------------------------------------------------------------


class LoginIn(BaseModel):
    matricula: str = Field(min_length=3, max_length=32)
    senha: str = Field(min_length=4, max_length=128)


class AlterarSenhaIn(ModeloBase):
    senha_atual: str = Field(min_length=4, max_length=128)
    nova_senha: str = Field(min_length=8, max_length=128)


class UsuarioOut(ModeloBase):
    id: int
    matricula: str
    nome: str
    nome_completo: str
    iniciais: str
    papel: str


class PerfilOut(ModeloBase):
    nome: str
    nome_completo: str
    iniciais: str
    matricula: str
    curso: str
    unidade: str
    turno: str


class TokenOut(BaseModel):
    """Resposta de login no formato OAuth2 (snake_case por convenção)."""

    access_token: str
    token_type: str = "bearer"
    expira_em: datetime
    usuario: UsuarioOut


class MeOut(ModeloBase):
    usuario: UsuarioOut
    perfil: PerfilOut | None = None


# --------------------------------------------------------------------------
# Aluno / agenda
# --------------------------------------------------------------------------


class AulaOut(ModeloBase):
    id: str
    inicio: str
    fim: str
    duracao: str
    titulo: str
    subtitulo: str
    sala: str
    sala_anterior: str | None = None
    instrutor: str
    iniciais: str
    tipo: str
    alterada: bool
    direcoes: str


class DiaOut(ModeloBase):
    data: date
    aulas: list[AulaOut]


class AlertaOut(ModeloBase):
    id: str
    titulo: str
    texto: str
    hora: str
    aula_id: str


class AvisoOut(ModeloBase):
    id: str
    tipo: str
    titulo: str
    texto: str
    quando: datetime
    lida: bool
    aula_id: str | None = None


class AgendaOut(ModeloBase):
    aluno: PerfilOut
    proxima_aula_id: str | None = None
    alerta: AlertaOut | None = None
    dias: list[DiaOut]
    avisos: list[AvisoOut]


# --------------------------------------------------------------------------
# Dashboard / coordenação
# --------------------------------------------------------------------------


class SalaOut(ModeloBase):
    id: int
    nome: str
    bloco: str
    andar: str
    tipo: str
    direcoes: str


class InstrutorOut(ModeloBase):
    id: int
    nome: str
    iniciais: str


class InstrutorCreateIn(ModeloBase):
    nome: str = Field(min_length=2, max_length=80)
    iniciais: str = Field(min_length=1, max_length=4)


class AlunoPainelOut(ModeloBase):
    id: int
    nome: str
    matricula: str
    curso: str
    turno: str


class AulaPainelOut(AulaOut):
    aluno: str
    aluno_id: int
    sala_id: int
    instrutor_id: int


class AvisoPainelOut(ModeloBase):
    id: str
    tipo: str
    titulo: str
    texto: str
    quando: datetime
    destinatario: str
    aluno_id: int | None = None


class DiaPainelOut(ModeloBase):
    data: date
    aulas: list[AulaPainelOut]


class AlocacoesOut(ModeloBase):
    inicio: date
    fim: date
    dias: list[DiaPainelOut]


class ConflitoOut(ModeloBase):
    tipo: str  # sala | instrutor
    recurso: str
    data: date
    inicio: str
    fim: str
    aula_a: str
    aula_b: str
    detalhe: str


class NotificacaoRefOut(ModeloBase):
    tipo: str
    id: str


class NotificacaoOut(ModeloBase):
    id: str
    tipo: str
    titulo: str
    texto: str
    quando: datetime
    referencia: NotificacaoRefOut | None = None


class ResumoOut(ModeloBase):
    data: date
    aulas_hoje: int
    labs_em_uso: int
    total_labs: int
    ocupacao_percent: int
    conflitos: int
    ultima_atualizacao: datetime


class EventoMudancaOut(ModeloBase):
    aula_id: str
    nova_sala: str
    sala_anterior: str | None = None
    mensagem: str


class ResultadoPushOut(ModeloBase):
    enviados: int = 0
    falhas: int = 0
    removidas: int = 0
    configurado: bool = False
    motivo: str | None = None


class MudancaSalaIn(ModeloBase):
    aula_id: str
    nova_sala_id: int
    mensagem: str | None = Field(default=None, max_length=280)


class MudancaSalaOut(ModeloBase):
    aula: AulaOut
    aviso: AvisoOut
    evento: EventoMudancaOut
    push: ResultadoPushOut


class AvisoCreateIn(ModeloBase):
    titulo: str = Field(min_length=3, max_length=120)
    texto: str = Field(min_length=3, max_length=2000)
    tipo: str = Field(default="sistema", max_length=24)
    aluno_id: int | None = None
    aula_id: str | None = None
    enviar_push: bool = True


class AvisoAtualizarIn(ModeloBase):
    titulo: str | None = Field(default=None, min_length=3, max_length=120)
    texto: str | None = Field(default=None, min_length=3, max_length=2000)
    tipo: str | None = Field(default=None, max_length=24)


class AvisoCreateOut(ModeloBase):
    aviso: AvisoOut
    destinatarios: int


class NovaAulaIn(ModeloBase):
    aluno_id: int
    sala_id: int
    instrutor_id: int
    data: date
    inicio: time
    fim: time
    titulo: str = Field(min_length=2, max_length=120)
    subtitulo: str = Field(default="", max_length=160)
    tipo: str = Field(default="teórica", max_length=20)
    notificar: bool = False
    id: str | None = Field(default=None, max_length=64)


class AulaAtualizarIn(ModeloBase):
    aluno_id: int | None = None
    sala_id: int | None = None
    instrutor_id: int | None = None
    data: date | None = None
    inicio: time | None = None
    fim: time | None = None
    titulo: str | None = Field(default=None, min_length=2, max_length=120)
    subtitulo: str | None = Field(default=None, max_length=160)
    tipo: str | None = Field(default=None, max_length=20)
    notificar: bool = False


# --------------------------------------------------------------------------
# Web Push
# --------------------------------------------------------------------------


class PushKeysIn(BaseModel):
    p256dh: str = Field(min_length=10)
    auth: str = Field(min_length=4)


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10)
    keys: PushKeysIn


class PushSubscriptionOut(ModeloBase):
    id: int
    endpoint: str
    criada_em: datetime


class ChavePublicaOut(ModeloBase):
    public_key: str


class PushTesteIn(BaseModel):
    titulo: str = "Gestor SENAI"
    corpo: str = "Notificação de teste enviada pela API."
    url: str = "./index.html#avisos"


class PushTesteOut(ModeloBase):
    resultado: ResultadoPushOut
