# Gestor SENAI · Back-end (api)

API em **FastAPI** para a PWA do aluno e o painel da coordenação do Gestor SENAI.

Cobre autenticação demo com JWT, agenda e avisos do aluno, tempo real por
**SSE**, indicadores e operações da coordenação e **Web Push (VAPID)**.

---

## Stack

| Item | Escolha |
| --- | --- |
| Framework | FastAPI 0.163 |
| Servidor | Uvicorn 0.54 |
| Banco | SQLite no MVP via SQLAlchemy 2.0 (troca para PostgreSQL por `DATABASE_URL`) |
| Auth | JWT HS256 (header `Authorization: Bearer` **e** cookie HttpOnly) |
| Senhas | PBKDF2-SHA256 com salt (stdlib) |
| Tempo real | SSE com broker em memória |
| Push | `pywebpush` + chaves VAPID |
| Testes | pytest + `TestClient` (SQLite em memória) |

---

## Como rodar

```powershell
cd backend

# 1) dependências
python -m pip install -r requirements.txt      # produção
python -m pip install -r requirements-dev.txt  # + pytest/httpx

# 2) chaves VAPID (uma vez; gera backend/.vapid/)
python scripts/gerar_vapid.py

# 3) dados de demonstração (o servidor também semeia se o banco estiver vazio)
python -m app.seed

# 4) servidor
python -m uvicorn app.main:app --reload --port 8000
```

- API: <http://127.0.0.1:8000>
- Swagger: <http://127.0.0.1:8000/docs>
- OpenAPI: <http://127.0.0.1:8000/openapi.json>
- Health: <http://127.0.0.1:8000/health>

---

## Credenciais demo

| Perfil | Matrícula | Senha |
| --- | --- | --- |
| Aluno (João Vitor) | `202604178821` | `senai123` |
| Aluno (Mariana) | `202604178822` | `senai123` |
| Aluno (Pedro) | `202604178823` | `senai123` |
| Coordenação | `coord01` | `senai123` |

> Senhas são hashes PBKDF2 no banco; as credenciais acima existem só no seed.

---

## Estrutura

```
backend/
├─ app/
│  ├─ main.py            # app, CORS, lifespan, /health
│  ├─ config.py          # Settings (env / .env)
│  ├─ database.py        # engine, sessão, criação de tabelas
│  ├─ models.py          # usuários, alunos, salas, aulas, avisos, push
│  ├─ schemas.py         # Pydantic (respostas em camelCase)
│  ├─ serializers.py     # modelos → contrato JSON
│  ├─ security.py        # hash de senha + JWT
│  ├─ deps.py            # usuário, aluno e coordenação autenticados
│  ├─ tempo.py           # utilitários de data/hora
│  ├─ seed.py            # dados demo (CLI com --reset)
│  ├─ routers/
│  │  ├─ auth.py         # login, logout, me
│  │  ├─ aluno.py        # perfil, agenda, avisos
│  │  ├─ eventos.py      # SSE /aluno/eventos
│  │  ├─ dashboard.py    # coordenação
│  │  └─ push.py         # inscrição e envio de push
│  └─ services/
│     ├─ agenda.py       # contrato da agenda + alerta
│     ├─ painel.py       # regras de alocação, avisos, mudança de sala
│     ├─ conflitos.py    # detecção de choque de sala/instrutor
│     ├─ push.py         # pywebpush e payloads
│     └─ broker.py       # filas SSE por aluno
├─ scripts/gerar_vapid.py
├─ tests/
├─ requirements.txt
├─ requirements-dev.txt
├─ .env.example
└─ pytest.ini
```

---

## Endpoints

### Diagnóstico

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/` | Identificação da API |
| GET | `/health` | Status, versão, Web Push ativo, conexões SSE |

### Autenticação

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/auth/login` | Login; devolve `access_token` e define cookie HttpOnly |
| POST | `/auth/logout` | Remove o cookie |
| GET | `/auth/me` | Usuário autenticado (e perfil do aluno) |

### Aluno

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/aluno/perfil` | Nome, matrícula, curso, unidade, turno |
| GET | `/aluno/agenda?dias=7` | Contrato completo: `aluno`, `proximaAulaId`, `alerta`, `dias[]`, `avisos[]` |
| GET | `/aluno/avisos?apenas_nao_lidos=false` | Avisos do aluno + globais |
| POST | `/aluno/avisos/{id}/ler` | Marca um aviso como lido |
| POST | `/aluno/avisos/ler-todos` | Marca todos como lidos |
| GET | `/aluno/eventos` | SSE (`mudanca-sala`, `aviso`) |

### Coordenação (papel `coordenacao`)

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/dashboard/resumo?data=` | Aulas do dia, labs em uso, ocupação, conflitos |
| GET | `/dashboard/alocacoes?inicio=&dias=6` | Grade de alocações |
| GET | `/dashboard/conflitos?inicio=&fim=` | Choques de sala e de instrutor |
| GET | `/dashboard/salas` | Catálogo de salas/labs |
| GET | `/dashboard/instrutores` | Catálogo de instrutores |
| GET | `/dashboard/alunos` | Alunos para seleção |
| GET | `/dashboard/avisos?limite=` | Avisos recentes enviados aos alunos (com destinatário) |
| POST | `/dashboard/mudanca-sala` | Move a aula, grava aviso, alerta, SSE e push |
| POST | `/dashboard/avisos` | Publica aviso (individual ou global) |
| POST | `/dashboard/aulas` | Aloca aula com validação de choque |

### Web Push

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/push/chave-publica` | `applicationServerKey` para o navegador |
| POST | `/push/inscrever` | Cria/atualiza assinatura do aluno |
| DELETE | `/push/cancelar?endpoint=` | Remove assinatura |
| POST | `/push/teste` | Envia notificação de teste |

---

## Exemplos com curl

```bash
# Login (guarde o access_token)
curl -s -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"matricula":"202604178821","senha":"senai123"}'

# Agenda
curl -s http://127.0.0.1:8000/aluno/agenda \
  -H "Authorization: Bearer SEU_TOKEN"

# Resumo da coordenação
curl -s http://127.0.0.1:8000/dashboard/resumo \
  -H "Authorization: Bearer TOKEN_COORD"

# Mudança de sala
curl -s -X POST http://127.0.0.1:8000/dashboard/mudanca-sala \
  -H "Authorization: Bearer TOKEN_COORD" \
  -H "Content-Type: application/json" \
  -d '{"aulaId":"aula-clp-14","novaSalaId":1,"mensagem":"Lab 04 em manutenção."}'

# Publicar aviso global
curl -s -X POST http://127.0.0.1:8000/dashboard/avisos \
  -H "Authorization: Bearer TOKEN_COORD" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Semana de Inovação","texto":"Inscrições abertas.","tipo":"evento"}'
```

Respostas seguem **camelCase** (`proximaAulaId`, `salaAnterior`,
`aulasHoje`, `ocupacaoPercent`...), compatíveis com `js/app.js`.
A única exceção é `POST /auth/login`, que mantém o padrão OAuth2:
`access_token`, `token_type`, `expira_em`.

---

## Tempo real (SSE)

`EventSource` não permite cabeçalhos, então o token pode ir na query:

```js
const fonte = new EventSource(
  `${API}/aluno/eventos?token=${encodeURIComponent(token)}`,
  { withCredentials: true }
);

fonte.addEventListener('mudanca-sala', (e) => console.log(JSON.parse(e.data)));
fonte.addEventListener('aviso', (e) => console.log(JSON.parse(e.data)));
```

- Um evento `conectado` é enviado ao abrir o canal.
- Keep-alive (`: keep-alive`) a cada 15 s.
- Filas de 100 eventos por conexão; cliente lento perde o mais antigo.
- Funciona também com cookie (`withCredentials`) ou header Bearer.

O broker é **em memória**: com mais de um worker/processo é preciso trocar por
Redis Pub/Sub ou similar.

---

## Web Push

1. Gere as chaves com `python scripts/gerar_vapid.py`.
2. No navegador, busque `GET /push/chave-publica` e inscreva:

```js
const { publicKey } = await fetch(`${API}/push/chave-publica`).then(r => r.json());
const inscricao = await registro.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: publicKey
});
await fetch(`${API}/push/inscrever`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(inscricao)
});
```

O payload enviado ao Service Worker é
`{ title, body, url, tag, data }`, já tratado em `sw.js`.

Sem chaves VAPID, `/push/chave-publica` e `/push/teste` respondem **503** e o
restante da API segue funcionando.

---

## Dados de demonstração

`python -m app.seed` cria apenas se o banco estiver vazio.
`python -m app.seed --reset` apaga e recria tudo.

O cenário inclui:

- 3 alunos e 1 coordenação;
- 6 salas (4 labs) e 3 instrutores;
- aulas de hoje até +4 dias;
- **1 conflito proposital** no Lab 03 (Mariana × Pedro, 10:30–11:30);
- mudança Lab 04 → Lab 05 na aula `aula-clp-14`, que gera o alerta do app;
- 3 avisos não lidos para o João.

---

## Testes

```powershell
cd backend
python -m pytest
```

Resultado esperado: **27 passed**. A suíte usa SQLite em memória, substitui
`get_db` por override, testa login/cookie, contrato da agenda, avisos,
conflitos, mudança de sala, criação de aula, push (com `webpush` mockado) e o
broker SSE.

---

## Configuração (`.env`)

Copie `.env.example` para `.env`:

| Variável | Padrão | Observação |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///backend/data/gestor_senai.db` | Use `postgresql+psycopg://...` para migrar |
| `JWT_SECRET` | valor inseguro | **Obrigatório trocar** em produção |
| `JWT_EXPIRA_MINUTOS` | `480` | Validade do token |
| `COOKIE_SECURE` | `false` | `true` com HTTPS |
| `CORS_ORIGINS` | portas 8080/5500/3000 | Origens exatas (credenciais) |
| `SEED_ON_STARTUP` | `true` | Semeia se o banco estiver vazio |
| `VAPID_SUBJECT` | `mailto:dev@gestorsenai.local` | Contato do VAPID |
| `VAPID_PUBLIC_KEY` | lida de `.vapid/public_key.txt` | Opcional |
| `VAPID_PRIVATE_KEY_PATH` | `.vapid/private_key.pem` | Nunca versionar |

---

## Integração com o front-end

O `js/app.js` já espera este contrato. Para conectar:

1. Suba a API e o front (`python serve.py`).
2. Faça login e guarde o token (ou use o cookie HttpOnly).
3. Em `js/app.js`, defina `CONFIG.API_BASE_URL = 'http://127.0.0.1:8000'`.
4. `carregarDadosDoAluno()` consome `GET /aluno/agenda` com
   `credentials: 'include'`, e `iniciarTempoReal()` abre o SSE.

Ajuste `CORS_ORIGINS` para a porta real do front. O cookie é `SameSite=Lax`;
para domínios diferentes em produção, avalie `SameSite=None; Secure` ou manter
o Bearer.

---

## Antes de produção

- [ ] Definir `JWT_SECRET` forte e `COOKIE_SECURE=true`.
- [ ] Migrar para PostgreSQL e versionar migrações (Alembic).
- [ ] Trocar o broker SSE em memória por Redis (múltiplos workers).
- [ ] Mover envio de Web Push para fila/background (`BackgroundTasks`, Celery).
- [ ] Restringir CORS às origens oficiais.
- [ ] Adicionar rate limit no login e logs de auditoria.
- [ ] Rotacionar chaves VAPID e manter a privada apenas no servidor.
