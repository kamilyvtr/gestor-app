# Guia de teste do PWA "Gestor SENAI" em iPhone (iOS)

## 1. Pre-requisitos
- Node.js instalado (para `npx`).
- Python 3 com o back-end e o front-end funcionando localmente.
- iPhone com iOS 16.4+ (para Web Push) e Safari.

## 2. Subir os servidores locais
Em dois terminais (na pasta do projeto):

```powershell
# Terminal 1 - front-end (porta 8080)
python serve.py
# ou: python -m http.server 8080

# Terminal 2 - back-end (porta 8000)
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 3. Subir o tunel HTTPS
No terminal, na raiz do projeto:

```powershell
.\start_tunnel.ps1
```

O script imprime as URLs publicas, por exemplo:
```
Front-end : https://yellow-streets-jog.loca.lt
Back-end  : https://big-pets-kiss.loca.lt
```
E salva em `tunnel-urls.txt`.

Alternativa com ngrok (se instalado):
```powershell
ngrok http 8080   # terminal 1
ngrok http 8000   # terminal 2
```

## 4. Apontar o front-end para o back-end publico
Opcao A (recomendada, sem editar arquivo): abra no iPhone a URL:
```
https://<front>.loca.lt/?api=https://<back>.loca.lt
```
O valor de `?api=` fica guardado no navegador (localStorage).

Opcao B: edite `env.js` e altere `API_BASE_URL` para a URL publica do back-end:
```js
window.GESTOR_ENV = Object.freeze({
  API_BASE_URL: 'https://<back>.loca.lt'
});
```

## 5. Primeiro acesso ao tunel (localtunnel)
Na primeira visita, o localtunnel exibe uma pagina pedindo a "tunnel password".
- Abra a URL do back-end no Safari do computador e informe o IP publico mostrado.
- Depois abra a URL do front-end no iPhone.

## 6. Instalar o PWA no iPhone
1. Abra o **Safari** no iPhone e acesse a URL publica do front-end.
2. Toque no icone **Compartilhar** (quadrado com seta para cima).
3. Role e toque em **Adicionar a Tela de Inicio**.
4. Confirme o nome "Gestor SENAI" e toque em **Adicionar**.
5. Abra o app pelo icone na tela de inicio (modo standalone, sem barra do navegador).

## 7. Ativar notificacoes (Web Push)
1. No app instalado, va em **Perfil**.
2. Na secao "Notificacoes", toque em **Ativar notificacoes**.
3. Autorize quando o iOS solicitar.
4. (Opcional) Toque em **Enviar notificacao de teste** para confirmar.

Observacao: no iOS, Web Push so funciona em PWA instalado (standalone) e com permissao concedida.

## 8. Testar o fluxo completo (mudanca de sala)
1. No computador, abra o painel da coordenacao:
   `https://<front>.loca.lt/dashboard.html?api=https://<back>.loca.lt`
   (ou use a mesma URL com `?api=`) e faca login com a conta de coordenacao (ex.: `coord01`).
2. No dashboard, abra uma aula (ex.: CLP no Lab 05) e altere a sala (ex.: para Lab 03),
   marcando "Notificar alunos".
3. No iPhone, com o app aberto ou em segundo plano, verifique:
   - O alerta/toast de mudanca de sala aparece no app.
   - A notificacao push chega na central de notificacoes do iOS.
4. Abra a agenda do aluno e confirme que a sala foi atualizada.

## 9. Solucao de problemas
- **CORS/erro de conexao**: confira se o back-end esta rodando e se a URL em `?api=` ou `env.js` esta correta (com `https://`).
- **Sem notificacao no iOS**: confirme que o app foi instalado na tela de inicio e que a permissao foi concedida em Ajustes > Notificacoes > Gestor SENAI.
- **Tunel caiu**: o localtunnel pode encerrar apos inatividade; rode `.\start_tunnel.ps1` novamente e atualize a URL (ou use `?api=`).
- **PWA nao instala**: exige HTTPS; verifique se a URL comeca com `https://` e se o Service Worker registrou (console do Safari).
- **Página de aviso do localtunnel/ngrok**: abra a URL do back-end uma vez no navegador ou envie os cabecalhos `bypass-tunnel-reminder` / `ngrok-skip-browser-warning` (ja incluidos no front-end).
