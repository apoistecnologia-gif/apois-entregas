$ErrorActionPreference = "Stop"
& "$PSScriptRoot\scripts\gerar-apk-local.ps1" -Product customer
exit $LASTEXITCODE
