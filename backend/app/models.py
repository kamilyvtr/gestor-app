from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .tempo import agora_utc


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    matricula: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    senha_hash: Mapped[str] = mapped_column(String(255))
    papel: Mapped[str] = mapped_column(String(20), default="aluno", index=True)
    nome: Mapped[str] = mapped_column(String(80))
    nome_completo: Mapped[str] = mapped_column(String(120))
    iniciais: Mapped[str] = mapped_column(String(4))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora_utc)

    aluno: Mapped[Aluno | None] = relationship(back_populates="usuario", uselist=False)


class Aluno(Base):
    __tablename__ = "alunos"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), unique=True
    )
    curso: Mapped[str] = mapped_column(String(120))
    unidade: Mapped[str] = mapped_column(String(120))
    turno: Mapped[str] = mapped_column(String(20), default="Tarde")

    usuario: Mapped[Usuario] = relationship(back_populates="aluno")
    aulas: Mapped[list[Aula]] = relationship(back_populates="aluno")
    leituras: Mapped[list[AvisoLeitura]] = relationship(back_populates="aluno")
    inscricoes: Mapped[list[PushSubscription]] = relationship(back_populates="aluno")


class Instrutor(Base):
    __tablename__ = "instrutores"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), unique=True)
    iniciais: Mapped[str] = mapped_column(String(4))

    aulas: Mapped[list[Aula]] = relationship(back_populates="instrutor")


class Sala(Base):
    __tablename__ = "salas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(40), unique=True)
    bloco: Mapped[str] = mapped_column(String(40), default="Bloco A")
    andar: Mapped[str] = mapped_column(String(40), default="Térreo")
    tipo: Mapped[str] = mapped_column(String(20), default="sala")  # sala | lab
    direcoes: Mapped[str] = mapped_column(Text, default="")

    aulas: Mapped[list[Aula]] = relationship(
        back_populates="sala", foreign_keys="Aula.sala_id"
    )


class Aula(Base):
    __tablename__ = "aulas"
    __table_args__ = (Index("ix_aulas_aluno_data", "aluno_id", "data"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    aluno_id: Mapped[int] = mapped_column(
        ForeignKey("alunos.id", ondelete="CASCADE"), index=True
    )
    data: Mapped[date] = mapped_column(Date, index=True)
    inicio: Mapped[time] = mapped_column(Time)
    fim: Mapped[time] = mapped_column(Time)
    titulo: Mapped[str] = mapped_column(String(120))
    subtitulo: Mapped[str] = mapped_column(String(160), default="")
    tipo: Mapped[str] = mapped_column(String(20), default="teórica")
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id"))
    sala_anterior_id: Mapped[int | None] = mapped_column(
        ForeignKey("salas.id"), nullable=True
    )
    instrutor_id: Mapped[int] = mapped_column(ForeignKey("instrutores.id"))
    alterada: Mapped[bool] = mapped_column(Boolean, default=False)
    direcoes: Mapped[str] = mapped_column(Text, default="")
    criada_em: Mapped[datetime] = mapped_column(DateTime, default=agora_utc)

    aluno: Mapped[Aluno] = relationship(back_populates="aulas")
    sala: Mapped[Sala] = relationship(back_populates="aulas", foreign_keys=[sala_id])
    sala_anterior: Mapped[Sala | None] = relationship(foreign_keys=[sala_anterior_id])
    instrutor: Mapped[Instrutor] = relationship(back_populates="aulas")


class Aviso(Base):
    __tablename__ = "avisos"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    aluno_id: Mapped[int | None] = mapped_column(
        ForeignKey("alunos.id", ondelete="CASCADE"), nullable=True, index=True
    )
    tipo: Mapped[str] = mapped_column(String(24), default="sistema")
    titulo: Mapped[str] = mapped_column(String(120))
    texto: Mapped[str] = mapped_column(Text)
    quando: Mapped[datetime] = mapped_column(DateTime, default=agora_utc)
    aula_id: Mapped[str | None] = mapped_column(
        ForeignKey("aulas.id", ondelete="SET NULL"), nullable=True
    )

    aluno: Mapped[Aluno | None] = relationship()
    aula: Mapped[Aula | None] = relationship()
    leituras: Mapped[list[AvisoLeitura]] = relationship(
        back_populates="aviso", cascade="all, delete-orphan"
    )


class AvisoLeitura(Base):
    __tablename__ = "aviso_leituras"

    aluno_id: Mapped[int] = mapped_column(
        ForeignKey("alunos.id", ondelete="CASCADE"), primary_key=True
    )
    aviso_id: Mapped[str] = mapped_column(
        ForeignKey("avisos.id", ondelete="CASCADE"), primary_key=True
    )
    lida_em: Mapped[datetime] = mapped_column(DateTime, default=agora_utc)

    aluno: Mapped[Aluno] = relationship(back_populates="leituras")
    aviso: Mapped[Aviso] = relationship(back_populates="leituras")


class AlteracaoSala(Base):
    __tablename__ = "alteracoes_sala"

    id: Mapped[int] = mapped_column(primary_key=True)
    aula_id: Mapped[str] = mapped_column(
        ForeignKey("aulas.id", ondelete="CASCADE"), index=True
    )
    sala_anterior_id: Mapped[int | None] = mapped_column(
        ForeignKey("salas.id"), nullable=True
    )
    sala_nova_id: Mapped[int] = mapped_column(ForeignKey("salas.id"))
    mensagem: Mapped[str | None] = mapped_column(Text, nullable=True)
    criada_em: Mapped[datetime] = mapped_column(DateTime, default=agora_utc, index=True)

    aula: Mapped[Aula] = relationship()
    sala_anterior: Mapped[Sala | None] = relationship(foreign_keys=[sala_anterior_id])
    sala_nova: Mapped[Sala] = relationship(foreign_keys=[sala_nova_id])


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    aluno_id: Mapped[int] = mapped_column(
        ForeignKey("alunos.id", ondelete="CASCADE"), index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255))
    auth: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    criada_em: Mapped[datetime] = mapped_column(DateTime, default=agora_utc)

    aluno: Mapped[Aluno] = relationship(back_populates="inscricoes")
