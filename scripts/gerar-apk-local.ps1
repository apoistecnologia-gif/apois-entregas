param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("customer", "courier")]
  [string]$Product
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Config = @{
  customer = @{
    Label = "Cliente"
    Route = "/"
    Package = "br.com.apois.cliente"
    Firebase = ".local-build\google-services-customer.json"
    ApkName = "APOIS-Cliente-debug.apk"
  }
  courier = @{
    Label = "Entregador"
    Route = "/courier"
    Package = "br.com.apois.entregador"
    Firebase = ".local-build\google-services-courier.json"
    ApkName = "APOIS-Entregador-debug.apk"
  }
}

$Target = $Config[$Product]
$FirebaseCache = Join-Path $Root $Target.Firebase
$AndroidGoogleServices = Join-Path $Root "android\app\google-services.json"
$OutputDir = Join-Path $Root "dist-apk"

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando '$Name' nao encontrado no Windows."
  }
}

function Test-GoogleServicesPackage([string]$Path, [string]$ExpectedPackage) {
  if (-not (Test-Path $Path)) { return $false }
  try {
    $json = Get-Content $Path -Raw | ConvertFrom-Json
    $packages = @($json.client | ForEach-Object { $_.client_info.android_client_info.package_name })
    return $packages -contains $ExpectedPackage
  } catch {
    return $false
  }
}

Write-Host "=== APOIS $($Target.Label) - GERADOR LOCAL DE APK ===" -ForegroundColor Cyan

Assert-Command "node"
Assert-Command "npm"
Assert-Command "npx"
Assert-Command "bun"
Assert-Command "java"

# Aproveita o google-services.json que ja estiver no Android e guarda uma copia
# fora da pasta nativa, pois a pasta android e recriada para garantir o appId correto.
if (Test-GoogleServicesPackage $AndroidGoogleServices $Target.Package) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $FirebaseCache) | Out-Null
  Copy-Item $AndroidGoogleServices $FirebaseCache -Force
  Write-Host "Firebase $($Target.Label) preservado em $($Target.Firebase)." -ForegroundColor DarkGray
}

if (-not (Test-GoogleServicesPackage $FirebaseCache $Target.Package)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $FirebaseCache) | Out-Null
  throw "Falta o google-services.json de $($Target.Label). Salve o arquivo correto em '$($Target.Firebase)' e execute novamente. O pacote esperado e '$($Target.Package)'."
}

$env:APOIS_MOBILE_PRODUCT = $Product
$env:APOIS_MOBILE_BUILD = "1"
$env:VITE_APOIS_PRODUCT_MODE = $Product

Write-Host "[1/7] Dependencias..." -ForegroundColor Yellow
& bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "bun install falhou." }

Write-Host "[2/7] Build web isolado..." -ForegroundColor Yellow
# Chama o build diretamente para evitar o problema spawnSync bun.cmd/EINVAL no Windows.
& bun run build
if ($LASTEXITCODE -ne 0) { throw "Build web falhou." }

Write-Host "[3/7] Gerando index.html para o Capacitor..." -ForegroundColor Yellow
$env:HOST = "127.0.0.1"
$env:PORT = "4173"
$Server = Start-Process -FilePath "node" -ArgumentList ".output/server/index.mjs" -PassThru -WindowStyle Hidden
try {
  $IndexPath = Join-Path $Root ".output\public\index.html"
  $Ready = $false
  for ($Attempt = 1; $Attempt -le 30; $Attempt++) {
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:4173$($Target.Route)" -OutFile $IndexPath -UseBasicParsing
      if ((Test-Path $IndexPath) -and ((Get-Item $IndexPath).Length -gt 0)) {
        $Ready = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $Ready) { throw "Nao foi possivel renderizar $($Target.Route) para .output/public/index.html." }
} finally {
  if ($Server -and -not $Server.HasExited) {
    Stop-Process -Id $Server.Id -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "[4/7] Recriando projeto Android para $($Target.Package)..." -ForegroundColor Yellow
if (Test-Path (Join-Path $Root "android")) {
  Remove-Item (Join-Path $Root "android") -Recurse -Force
}
& npm install --no-save "@capacitor/core@8.4.2" "@capacitor/cli@8.4.2" "@capacitor/android@8.4.2" "@capacitor/geolocation@8.2.0" "@capacitor/push-notifications@8.1.2"
if ($LASTEXITCODE -ne 0) { throw "Instalacao do runtime Android falhou." }
& npx cap add android
if ($LASTEXITCODE -ne 0) { throw "npx cap add android falhou." }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $AndroidGoogleServices) | Out-Null
Copy-Item $FirebaseCache $AndroidGoogleServices -Force

Write-Host "[5/7] Sincronizando plugins e configuracao nativa..." -ForegroundColor Yellow
& npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "npx cap sync android falhou." }
& bun run android:configure
if ($LASTEXITCODE -ne 0) { throw "android:configure falhou." }

$Manifest = Join-Path $Root "android\app\src\main\AndroidManifest.xml"
if (-not (Select-String -Path $Manifest -Pattern "ACCESS_FINE_LOCATION" -Quiet)) { throw "ACCESS_FINE_LOCATION ausente no AndroidManifest." }
if (-not (Select-String -Path $Manifest -Pattern "ACCESS_COARSE_LOCATION" -Quiet)) { throw "ACCESS_COARSE_LOCATION ausente no AndroidManifest." }

Write-Host "[6/7] Compilando APK debug..." -ForegroundColor Yellow
Push-Location (Join-Path $Root "android")
try {
  & .\gradlew.bat assembleDebug
  $GradleExit = $LASTEXITCODE

  if ($GradleExit -ne 0) {
    Write-Host "Gradle falhou. Limpando cache de transforms e tentando uma vez novamente..." -ForegroundColor DarkYellow
    & .\gradlew.bat --stop | Out-Null
    $Transforms = Join-Path $HOME ".gradle\caches\8.14.3\transforms"
    Remove-Item $Transforms -Recurse -Force -ErrorAction SilentlyContinue
    & .\gradlew.bat assembleDebug --refresh-dependencies
    $GradleExit = $LASTEXITCODE
  }

  if ($GradleExit -ne 0) { throw "Gradle assembleDebug falhou." }
} finally {
  Pop-Location
}

Write-Host "[7/7] Copiando APK final..." -ForegroundColor Yellow
$BuiltApk = Join-Path $Root "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $BuiltApk)) { throw "APK nao encontrado apos BUILD SUCCESSFUL." }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$FinalApk = Join-Path $OutputDir $Target.ApkName
Copy-Item $BuiltApk $FinalApk -Force

$Apk = Get-Item $FinalApk
Write-Host "" 
Write-Host "APK GERADO COM SUCESSO" -ForegroundColor Green
Write-Host "Produto : APOIS $($Target.Label)"
Write-Host "Pacote  : $($Target.Package)"
Write-Host "Arquivo : $($Apk.FullName)"
Write-Host "Tamanho : $([math]::Round($Apk.Length / 1MB, 2)) MB"
Write-Host ""
Start-Process explorer.exe -ArgumentList $OutputDir
