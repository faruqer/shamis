# Copies your cleaned local database to the server.
# Run from the project root on your PC.
#
# Example:
#   .\scripts\publish-clean-db.ps1 -ServerDbPath "D:\apps\Stock and Money\prisma\dev.db"
#
param(
  [Parameter(Mandatory = $true)]
  [string]$ServerDbPath,

  [string]$LocalDbPath = "dev (2).db"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path $LocalDbPath)) {
  Write-Error "Local database not found: $LocalDbPath"
}

$serverDir = Split-Path $ServerDbPath -Parent
if (-not (Test-Path $serverDir)) {
  Write-Error "Server folder not found: $serverDir"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (Test-Path $ServerDbPath) {
  $backupPath = "$ServerDbPath.backup-$timestamp"
  Copy-Item $ServerDbPath $backupPath -Force
  Write-Host "Backed up server DB to:"
  Write-Host "  $backupPath"
}

Copy-Item $LocalDbPath $ServerDbPath -Force
Write-Host ""
Write-Host "Published cleaned database:"
Write-Host "  from $LocalDbPath"
Write-Host "  to   $ServerDbPath"
Write-Host ""
Write-Host "Next on the server:"
Write-Host "  1. Stop the app"
Write-Host "  2. Ensure .env has DATABASE_URL=`"file:./dev.db`""
Write-Host "  3. Start the app again (npm run start:prod)"
