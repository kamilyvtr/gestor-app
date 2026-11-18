<#
.SYNOPSIS
  Sobe tuneis HTTPS para testar o PWA "Gestor SENAI" em um iPhone real.

.DESCRIPTION
  Por padrao usa o localtunnel (npx localtunnel) para expor:
    - front-end na porta 8080
    - back-end  na porta 8000

  As URLs publicas sao capturadas e exibidas no terminal. Os processos
  ficam rodando ate voce pressionar Ctrl+C (que encerra os tuneis).

  Alternativa ngrok (se estiver instalado):
    ngrok http 8080   (em um terminal)
    ngrok http 8000   (em outro terminal)
  ou configure os dois tuneis em um unico ngrok.yml e rode "ngrok start --all".

  Pre-requisito (uma vez):
    npm install -g localtunnel
#>

param(
    [switch]$UseNgrok
)

$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Raiz

function Testar-Comando($nome) {
    return [bool](Get-Command $nome -ErrorAction SilentlyContinue)
}

function Iniciar-Localtunnel($porta, $nome) {
    $sufixo = [guid]::NewGuid().ToString("N").Substring(0, 8)
    $log = Join-Path $env:TEMP ("gestor-senai-lt-" + $porta + "-" + $sufixo + ".log")
    $err = $log + ".err"

    Write-Host ("  -> iniciando tunel para " + $nome + " (porta " + $porta + ")...") -ForegroundColor Cyan

    $proc = Start-Process -FilePath "npx.cmd" -ArgumentList @("--yes", "localtunnel", "--port", "$porta") -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError $err

    $url = $null
    for ($i = 0; $i -lt 60 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $log) {
            $conteudo = Get-Content $log -Raw -ErrorAction SilentlyContinue
            if ($conteudo -match 'https://[a-z0-9-]+\.loca\.lt') {
                $url = $Matches[0]
            }
        }
    }

    if (-not $url) {
        Write-Host ("  !! nao foi possivel obter a URL do tunel da porta " + $porta + ".") -ForegroundColor Red
        if (Test-Path $log) { Get-Content $log | Write-Host }
        if (Test-Path $err) { Get-Content $err | Write-Host }
    }

    return @{ Process = $proc; Url = $url; Porta = $porta; Nome = $nome; Log = $log }
}

if ($UseNgrok) {
    if (-not (Testar-Comando "ngrok")) {
        Write-Host "ngrok nao encontrado no PATH. Instale em https://ngrok.com/download" -ForegroundColor Red
        exit 1
    }
} else {
    if (-not (Testar-Comando "npx")) {
        Write-Host "npx (Node.js) nao encontrado. Instale o Node.js em https://nodejs.org" -ForegroundColor Red
        exit 1
    }
    if (-not (Testar-Comando "lt")) {
        Write-Host "localtunnel nao esta instalado globalmente. Tentando via npx (pode demorar na primeira vez)." -ForegroundColor Yellow
        Write-Host "Para instalar: npm install -g localtunnel" -ForegroundColor Yellow
    }
}

if ($UseNgrok) {
    Write-Host ""
    Write-Host "Modo ngrok selecionado." -ForegroundColor Cyan
    Write-Host "Abra dois terminais e rode:" -ForegroundColor White
    Write-Host "   ngrok http 8080" -ForegroundColor Green
    Write-Host "   ngrok http 8000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Depois copie as URLs HTTPS geradas e use ?api=<url-backend> no front-end." -ForegroundColor White
    exit 0
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Gestor SENAI - tuneis HTTPS para teste em iPhone" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""

$frontend = Iniciar-Localtunnel 8080 "front-end (PWA)"
$backend = Iniciar-Localtunnel 8000 "back-end (API)"

$tuneis = @($frontend, $backend)

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  URLs publicas geradas:" -ForegroundColor White
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
$feUrl = "<indisponivel>"
$beUrl = "<indisponivel>"
if ($frontend.Url) { $feUrl = $frontend.Url }
if ($backend.Url) { $beUrl = $backend.Url }
Write-Host ("  Front-end : " + $feUrl) -ForegroundColor Green
Write-Host ("  Back-end  : " + $beUrl) -ForegroundColor Green
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

if ($frontend.Url -and $backend.Url) {
    $urlTeste = $frontend.Url + "/?api=" + $backend.Url
    Write-Host "  Abra no iPhone (Safari):" -ForegroundColor White
    Write-Host ("    " + $urlTeste) -ForegroundColor Yellow
    Write-Host ""
    Write-Host ("  Ou edite env.js e defina API_BASE_URL = '" + $backend.Url + "'.") -ForegroundColor White
    Write-Host ""

    $arquivoUrls = Join-Path $Raiz "tunnel-urls.txt"
    $linhas = @()
    $linhas += ("Front-end : " + $frontend.Url)
    $linhas += ("Back-end  : " + $backend.Url)
    $linhas += ("Teste     : " + $urlTeste)
    $linhas += ("Gerado em : " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    $linhas | Set-Content -Path $arquivoUrls -Encoding UTF8
    Write-Host ("  URLs salvas em: " + $arquivoUrls) -ForegroundColor DarkGray
}

Write-Host "  Mantendo os tuneis ativos. Pressione Ctrl+C para encerrar." -ForegroundColor Cyan
Write-Host ""

try {
    while ($true) {
        foreach ($t in $tuneis) {
            if ($t.Process.HasExited) {
                Write-Host ("  !! tunel " + $t.Nome + " (porta " + $t.Porta + ") encerrou inesperadamente.") -ForegroundColor Red
            }
        }
        Start-Sleep -Seconds 2
    }
} finally {
    foreach ($t in $tuneis) {
        if ($t.Process -and -not $t.Process.HasExited) {
            try { Stop-Process -Id $t.Process.Id -Force -ErrorAction SilentlyContinue } catch { }
        }
    }
    Write-Host ""
    Write-Host "  Tuneis encerrados." -ForegroundColor Cyan
}
