$ErrorActionPreference = "Stop"
& "$PSScriptRoot\scripts\gerar-apk-local.ps1" -Product courier
exit $LASTEXITCODE
