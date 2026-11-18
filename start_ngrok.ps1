<#
.SYNOPSIS
  Gestor SENAI - expoe Front-end (8080) e Back-end (8000) na internet via ngrok.

.DESCRIPTION
  1) Verifica se o ngrok esta instalado e se ja existe authtoken salvo.
  2) Se nao houver token (ou se ele for recusado com ERR_NGROK_4018), pede
     para o usuario colar o token na tela e salva com "config add-authtoken".
  3) Gera o ngrok.yml com os tuneis "front" e "back".
  4) Inicia o ngrok em SEGUNDO PLANO (Start-Process), sem travar o PowerShell.
  5) Aguarda 3 segundos e le as URLs pela API local http://127.0.0.1:4040/api/tunnels.
  6) Atualiza o env.js com a URL publica do back-end.
  7) Mostra o link completo Front + /?api= + Back para colar no Safari do iPhone.

  Uso: clique com o botao direito em start_ngrok.ps1 > Executar com PowerShell
       ou rode: .\start_ngrok.ps1
#>

$ErrorActionPreference = 'Stop'

$Raiz      = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Raiz

$ConfigPath = Join-Path $Raiz 'ngrok.yml'
$EnvPath    = Join-Path $Raiz 'env.js'
$OutLog     = Join-Path $Raiz 'ngrok-out.log'
$ErrLog     = Join-Path $Raiz 'ngrok-err.log'
$AuthOut    = Join-Path $Raiz 'ngrok-auth-out.log'
$AuthErr    = Join-Path $Raiz 'ngrok-auth-err.log'
$UrlsPath   = Join-Path $Raiz 'tunnel-urls.txt'

$script:NgrokExe = $null

# ---------------------------------------------------------------------------
# Funcoes de interface
# ---------------------------------------------------------------------------

function Escrever-Titulo {
    param([string]$Texto)
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ("  " + $Texto) -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Escrever-Passo {
    param([string]$Texto)
    Write-Host ("  [ ] " + $Texto) -ForegroundColor White
}

function Escrever-Ok {
    param([string]$Texto)
    Write-Host ("  [OK] " + $Texto) -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Localizar o ngrok
# ---------------------------------------------------------------------------

function Localizar-Ngrok {
    $comando = Get-Command ngrok -ErrorAction SilentlyContinue
    if ($comando -and $comando.Source) { return $comando.Source }

    $candidatos = @(
        (Join-Path $env:LOCALAPPDATA 'ngrok\ngrok.exe'),
        (Join-Path $env:PROGRAMFILES 'ngrok\ngrok.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'ngrok\ngrok.exe'),
        (Join-Path $env:USERPROFILE 'scoop\shims\ngrok.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ngrok.exe'),
        (Join-Path $env:USERPROFILE '.ngrok2\ngrok.exe')
    )

    foreach ($caminho in $candidatos) {
        if ($caminho -and (Test-Path $caminho)) { return $caminho }
    }
    return $null
}

# ---------------------------------------------------------------------------
# Autenticacao
# ---------------------------------------------------------------------------

function Testar-AuthtokenSalvo {
    $caminhos = @(
        (Join-Path $env:LOCALAPPDATA 'ngrok\ngrok.yml'),
        (Join-Path $env:APPDATA 'ngrok\ngrok.yml'),
        (Join-Path $env:USERPROFILE '.ngrok2\ngrok.yml')
    )

    foreach ($caminho in $caminhos) {
        if (-not (Test-Path $caminho)) { continue }
        $conteudo = Get-Content -Path $caminho -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($conteudo -match '(?m)^\s*authtoken:\s*\S+') { return $true }
    }
    return $false
}

function Pedir-E-Salvar-Token {
    param([string]$Motivo)

    Write-Host ''
    Write-Host ("  " + $Motivo) -ForegroundColor Yellow
    Write-Host '  1) Abra este link no navegador:' -ForegroundColor White
    Write-Host '     https://dashboard.ngrok.com/get-started/your-authtoken' -ForegroundColor Cyan
    Write-Host '  2) Copie o token (comeca com 2...) e cole quando perguntado.' -ForegroundColor White
    Write-Host '  3) Volte aqui e pressione Enter.' -ForegroundColor White
    Write-Host ''

    for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
        $token = (Read-Host ('  Token do ngrok (tentativa ' + $tentativa + ' de 3)')).Trim()

        if ([string]::IsNullOrWhiteSpace($token)) {
            Write-Host '  Token vazio. Tente novamente.' -ForegroundColor Red
            continue
        }

        Remove-Item -Path $AuthOut, $AuthErr -ErrorAction SilentlyContinue

        # -Wait + redirecionamento: nao le o terminal, nao trava o PowerShell.
        $processo = Start-Process -FilePath $script:NgrokExe `
            -ArgumentList @('config', 'add-authtoken', $token) `
            -PassThru -Wait -WindowStyle Hidden `
            -RedirectStandardOutput $AuthOut `
            -RedirectStandardError $AuthErr

        if ($processo.ExitCode -eq 0) {
            Escrever-Ok 'Token salvo no computador. Nao precisara digitar de novo.'
            return $true
        }

        $detalhe = ''
        if (Test-Path $AuthErr) { $detalhe = (Get-Content $AuthErr -Raw -Encoding UTF8 -ErrorAction SilentlyContinue).Trim() }
        if (-not $detalhe -and (Test-Path $AuthOut)) { $detalhe = (Get-Content $AuthOut -Raw -Encoding UTF8 -ErrorAction SilentlyContinue).Trim() }
        if ($detalhe) { Write-Host (" Detalhe: " + $detalhe) -ForegroundColor DarkGray }
        Write-Host '  O ngrok nao aceitou esse token. Confira e tente de novo.' -ForegroundColor Red
    }

    return $false
}

# ---------------------------------------------------------------------------
# Tuneis
# ---------------------------------------------------------------------------

function Parar-Ngrok {
    $processos = Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue
    if ($processos) {
        $processos | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 700
    }
}

function Gerar-ConfigNgrok {
    $config = @"
version: "3"
tunnels:
  front:
    proto: http
    addr: 8080
  back:
    proto: http
    addr: 8000
"@

    # UTF-8 sem BOM: o ngrok nao aceita BOM no inicio do YAML.
    [System.IO.File]::WriteAllText(
        $ConfigPath,
        $config,
        (New-Object System.Text.UTF8Encoding($false))
    )

    Escrever-Ok "Arquivo ngrok.yml gerado (front=8080, back=8000)."
}

function Obter-UrlsDaApi {
    param([System.Diagnostics.Process]$Processo)

    $front = $null
    $back  = $null
    $prazo = (Get-Date).AddSeconds(20)

    while ((Get-Date) -lt $prazo) {
        if ($Processo -and $Processo.HasExited) { break }

        try {
            $dados = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' `
                -Method Get -TimeoutSec 2 -ErrorAction Stop

            foreach ($tunel in $dados.tunnels) {
                $url = [string]$tunel.public_url
                if ($url -notmatch '^https://') { continue }

                $nome = [string]$tunel.name
                $addr = [string]$tunel.config.addr

                if ($nome -eq 'front' -or $addr -match '8080') {
                    $front = $url.TrimEnd('/')
                }
                elseif ($nome -eq 'back' -or $addr -match '8000') {
                    $back = $url.TrimEnd('/')
                }
            }
        } catch {
            # API ainda nao subiu; tenta novamente.
        }

        if ($front -and $back) { break }
        Start-Sleep -Milliseconds 500
    }

    $log = ''
    foreach ($arquivo in @($ErrLog, $OutLog)) {
        if (Test-Path $arquivo) {
            $log += (Get-Content -Path $arquivo -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
        }
    }

    $erroAuth = $false
    if ($log -match '(?i)ERR_NGROK_4018|4018|unauthorized|authentication failed|invalid authtoken|authtoken.*invalid') {
        $erroAuth = $true
    }

    return [pscustomobject]@{
        Front    = $front
        Back     = $back
        ErroAuth = $erroAuth
        Log      = $log
    }
}

function Iniciar-Tuneis {
    Parar-Ngrok
    Remove-Item -Path $OutLog, $ErrLog -ErrorAction SilentlyContinue

    $argumentos = @('start', '--all', '--config', ('"' + $ConfigPath + '"'))

    $processo = Start-Process -FilePath $script:NgrokExe `
        -ArgumentList $argumentos `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog

    Escrever-Passo 'Aguardando 3 segundos para o ngrok subir...'
    Start-Sleep -Seconds 3

    $resultado = Obter-UrlsDaApi -Processo $processo

    return [pscustomobject]@{
        Processo = $processo
        Front    = $resultado.Front
        Back     = $resultado.Back
        ErroAuth = $resultado.ErroAuth
        Log      = $resultado.Log
    }
}

# ---------------------------------------------------------------------------
# Atualizacao do env.js e do arquivo de referencia
# ---------------------------------------------------------------------------

function Atualizar-EnvJs {
    param([string]$BackUrl)

    $novo = "API_BASE_URL: '$BackUrl'"
    $conteudo = $null

    if (Test-Path $EnvPath) {
        $conteudo = Get-Content -Path $EnvPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    }

    if ($conteudo) {
        $atualizado = [regex]::Replace($conteudo, "API_BASE_URL:\s*'[^']*'", $novo)
        $atualizado = [regex]::Replace($atualizado, 'API_BASE_URL:\s*"[^"]*"', $novo)

        if ($atualizado -notmatch [regex]::Escape($novo)) {
            $atualizado = ""
        }
    } else {
        $atualizado = ""
    }

    if (-not $atualizado) {
        $atualizado = @"
/* ==========================================================================
   Gestor SENAI - configuracao de ambiente (front-end)
   Gerado automaticamente por start_ngrok.ps1
   ========================================================================== */
(function () {
  'use strict';
  window.GESTOR_ENV = Object.freeze({
    $novo
  });
})();
"@
    }

    # UTF-8 sem BOM (compatvel com navegadores e PWA).
    [System.IO.File]::WriteAllText(
        $EnvPath,
        $atualizado,
        (New-Object System.Text.UTF8Encoding($false))
    )

    Escrever-Ok 'env.js atualizado com a URL do back-end.'
}

function Salvar-ReferenciaUrls {
    param([string]$FrontUrl, [string]$BackUrl, [string]$LinkCompleto)

    $texto = @"
Gestor SENAI - URLs publicas
Gerado em: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')

Front-end : $FrontUrl
Back-end  : $BackUrl

LINK PARA O IPHONE:
$LinkCompleto
"@

    [System.IO.File]::WriteAllText(
        $UrlsPath,
        $texto,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

# ---------------------------------------------------------------------------
# Fluxo principal
# ---------------------------------------------------------------------------

try {
    Escrever-Titulo 'GESTOR SENAI | TUNEIS HTTPS VIA NGROK'

    Escrever-Passo 'Localizando o ngrok...'
    $script:NgrokExe = Localizar-Ngrok
    if (-not $script:NgrokExe) {
        Write-Host ''
        Write-Host '  O ngrok nao foi encontrado neste computador.' -ForegroundColor Red
        Write-Host '  Baixe em: https://ngrok.com/download' -ForegroundColor Yellow
        Write-Host '  Depois rode este script novamente.' -ForegroundColor Yellow
        Write-Host ''
        exit 1
    }
    Escrever-Ok ("ngrok encontrado: " + $script:NgrokExe)

    Escrever-Passo 'Verificando se ja existe authtoken salvo...'
    if (-not (Testar-AuthtokenSalvo)) {
        if (-not (Pedir-E-Salvar-Token -Motivo 'Nenhum authtoken encontrado. Vamos configurar agora.')) {
            exit 1
        }
    } else {
        Escrever-Ok 'Authtoken encontrado. Se estiver desatualizado, o proximo passo pedira outro.'
    }

    Escrever-Passo 'Gerando configuracao dos tuneis...'
    Gerar-ConfigNgrok

    $resultado = $null

    for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
        Write-Host ''
        Write-Host ("  --- Tentativa " + $tentativa + " de 3 ---") -ForegroundColor DarkCyan

        $teste = Iniciar-Tuneis

        if ($teste.Front -and $teste.Back -and -not $teste.ErroAuth) {
            $resultado = $teste
            break
        }

        Parar-Ngrok

        if ($tentativa -eq 3) { break }

        if ($teste.ErroAuth) {
            $motivo = 'O ngrok recusou o authtoken (ERRO 4018). O token pode estar expirado ou errado.'
        } else {
            $motivo = 'O ngrok nao retornou as URLs publicas. Vamos conferir o token.'
        }

        if (-not (Pedir-E-Salvar-Token -Motivo $motivo)) {
            exit 1
        }
    }

    if (-not $resultado) {
        Write-Host ''
        Write-Host '  Nao foi possivel iniciar os tuneis apos 3 tentativas.' -ForegroundColor Red
        Write-Host '  Ultima mensagem do ngrok:' -ForegroundColor Yellow
        if ($teste.Log) {
            Write-Host ($teste.Log.Trim()) -ForegroundColor DarkGray
        }
        Write-Host '  Abra https://dashboard.ngrok.com/get-started/your-authtoken' -ForegroundColor Yellow
        Write-Host '  e rode este script novamente com o token correto.' -ForegroundColor Yellow
        Write-Host ''
        exit 1
    }

    $frontUrl = $resultado.Front
    $backUrl  = $resultado.Back
    $linkCompleto = $frontUrl + '/?api=' + $backUrl

    Escrever-Ok 'Tuneis ativos. Lendo as URLs pela API local...'

    Escrever-Passo 'Atualizando env.js...'
    Atualizar-EnvJs -BackUrl $backUrl

    Salvar-ReferenciaUrls -FrontUrl $frontUrl -BackUrl $backUrl -LinkCompleto $linkCompleto
    Escrever-Ok 'Referencia salva em tunnel-urls.txt.'

    Escrever-Titulo 'TUDO PRONTO - COPIE O LINK DO IPHONE'

    Write-Host '  FRONT-END :' -ForegroundColor White
    Write-Host ('    ' + $frontUrl) -ForegroundColor Green
    Write-Host ''
    Write-Host '  BACK-END  :' -ForegroundColor White
    Write-Host ('    ' + $backUrl) -ForegroundColor Green
    Write-Host ''
    Write-Host '  ============================================================' -ForegroundColor Yellow
    Write-Host '  LINK COMPLETO PARA O IPHONE (copie e cole no Safari):' -ForegroundColor Yellow
    Write-Host '  ============================================================' -ForegroundColor Yellow
    Write-Host ('  ' + $linkCompleto) -ForegroundColor Yellow
    Write-Host '  ============================================================' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  Dica: abra no Safari, toque em Compartilhar > Adicionar a Tela' -ForegroundColor Cyan
    Write-Host '        de Inicio para instalar o PWA.' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  O ngrok esta rodando em segundo plano (nao precisa deixar esta' -ForegroundColor DarkGray
    Write-Host '  janela aberta). Para encerrar, rode:' -ForegroundColor DarkGray
    Write-Host '    Get-Process ngrok | Stop-Process -Force' -ForegroundColor DarkGray
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host '  Ocorreu um problema inesperado:' -ForegroundColor Red
    Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '  Rode o script novamente. Se continuar, verifique o ngrok e o token.' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}