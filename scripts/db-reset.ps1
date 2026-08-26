$ErrorActionPreference = "Stop"

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Resetting database..."
npx prisma db push --force-reset --accept-data-loss

Write-Host "Seeding admin account..."
npm run db:seed:admin

Write-Host ""
Write-Host "Done. Database is empty except for the admin user."
Write-Host "Login: admin@stockmoney.com / admin123"
