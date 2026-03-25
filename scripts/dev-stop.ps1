$ErrorActionPreference = "Stop"

Write-Host "Stopping Supabase local stack..." -ForegroundColor Cyan
supabase stop --project-id web
Write-Host "Supabase local stack stopped." -ForegroundColor Green
