# Gestor SENAI

Sistema de gestão de salas, laboratórios e aulas do SENAI Bacabal.

- **PWA do aluno** (`index.html`): agenda, avisos, mudança de sala em tempo real e notificações.
- **Painel da coordenação** (`dashboard.html`): alocação de salas, conflitos e avisos.

## Stack

| Camada | Tecnologia | Hospedagem |
|---|---|---|
| Front-end | HTML + Tailwind CSS + JS puro (PWA) | **Vercel** |
| Back-end | FastAPI + SQLAlchemy + JWT + Web Push | **Render** (free) |
| Banco | PostgreSQL | **Neon** |

## Links

- Front-end: `https://gestor-app-backend-fpbt2hhvk-kamilyvtrs-projects.vercel.app`
- API: `https://gestor-app-to6m.onrender.com` (`/docs` para o Swagger)
- Repositório: `https://github.com/kamilyvtr/gestor-app`

## Credenciais de teste

| Perfil | Matrícula | Senha |
|---|---|---|
| Coordenação | `coord01` | `senai123` |
| Aluno | `202604178821` | `senai123` |

## Rodando localmente

```powershell
# Windows: abre as duas janelas (front-end na 8080 e API na 8000)
.\Ligar_Sistema.bat
```

Ou manualmente:

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000   # dentro de backend/
python serve.py                                             # na raiz
```

**A URL da API é escolhida automaticamente pelo `env.js`:**

| Onde a página está aberta | API usada |
|---|---|
| `localhost:8080` / `127.0.0.1:8080` | `http://localhost:8000` (local) |
| Vercel (ou qualquer domínio público) | `https://gestor-app-to6m.onrender.com` |

Para apontar o front para **outra** API sem editar arquivos, abra uma vez com
`?api=`: `http://localhost:8080/?api=https://gestor-app-to6m.onrender.com`
(o override vale para a sessão do navegador).

> Ao abrir o site local pela primeira vez após uma atualização, recarregue a página
> **duas vezes**: a primeira baixa o `sw.js` novo, a segunda já usa os arquivos novos.

## Deploy automático (fluxo de trabalho)

O deploy é 100% automático: **todo `git push` para a branch `main` dispara os dois**.

```
git push origin main
        │
        ├──► Vercel  → redeploy do front-end estático (~30 s)
        └──► Render  → redeploy da API FastAPI (~2–3 min)
```

### ⚠️ REGRA DE OURO — sempre versionar o Service Worker

Sempre que alterar **qualquer arquivo do front-end** (`.html`, `.css`, `.js` — inclusive `env.js`),
é **obrigatório** subir a versão no topo do `sw.js`:

```js
const VERSAO = '5.2.0';   // 5.2.0 → 5.3.0 → 5.4.0 ...
```

**Por quê:** o `sw.js` usa *stale-while-revalidate* para os arquivos do app. Sem trocar a versão,
o navegador continua mostrando a versão antiga em cache (inclusive `env.js` com a URL errada da API).
Com a versão nova, o evento `activate` apaga os caches antigos e aplica os arquivos atualizados.

> Mudanças **só no back-end** (`backend/`) não exigem bump do `sw.js`.

### Back-end: variáveis de ambiente (Render)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string do Neon (`postgresql://...?sslmode=require`) |
| `JWT_SECRET` | Chave secreta dos tokens |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CLAIMS_SUB` | Web Push |
| `CORS_ORIGINS` | Origens extras liberadas (aceita string separada por vírgulas) |

> O plano free do Render hiberna após ~15 min sem acesso. Na primeira requisição o
> front-end mostra "Acordando o servidor..." e espera até 60 s. Para a apresentação,
> use um monitor HTTP em `/health` a cada 10 min (cron-job.org / UptimeRobot).

## Popular o banco de produção (Neon)

```powershell
cd backend
$env:DATABASE_URL="postgresql://...?sslmode=require"
python seed_producao.py
```

O script é idempotente: cria as tabelas que faltarem e insere usuários/seed apenas se não existirem.
Nunca apaga dados.

## Estrutura

```
├── index.html / login.html / dashboard.html   # páginas do front-end
├── css/  js/  assets/                        # estilos, scripts e ícones
├── env.js                                    # URL da API (front-end)
├── sw.js                                     # Service Worker (VERSIONAR!)
├── manifest.webmanifest                      # PWA
├── vercel.json / .vercelignore               # deploy estático da Vercel
├── backend/                                  # API FastAPI
│   ├── app/                                  # routers, models, config
│   ├── requirements.txt  runtime.txt  render.yaml
│   └── seed_producao.py                      # povoar o Neon
└── Ligar_Sistema.bat                         # sobe front + API no Windows
```
