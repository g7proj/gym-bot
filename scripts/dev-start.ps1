param(
  [string]$TimeZone = "Europe/Rome",
  [switch]$Restart
)

$ErrorActionPreference = "Stop"

Write-Host "== Gym Bot local dev setup ==" -ForegroundColor Cyan

Write-Host "Checking Docker..." -ForegroundColor Cyan
try {
  docker info | Out-Null
} catch {
  Write-Host "Docker does not seem to be running. Start Docker Desktop and re-run this script." -ForegroundColor Red
  exit 1
}

if ($Restart) {
  Write-Host "Stopping Supabase local stack..." -ForegroundColor Cyan
  supabase stop
}

$secretsPath = "C:\projects\gym-bot\.env.local"
$secrets = @{}
if (Test-Path $secretsPath) {
  Get-Content $secretsPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $pair = $line.Split('=', 2)
    if ($pair.Count -eq 2) {
      $secrets[$pair[0].Trim()] = $pair[1].Trim()
    }
  }
}

function Set-SecretValue {
  param(
    [string]$Key,
    [string]$Value
  )
  $secrets[$Key] = $Value
}
function Write-TextNoBom {
  param(
    [string]$Path,
    [string[]]$Lines
  )
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $writer = New-Object System.IO.StreamWriter($Path, $false, $encoding)
  try {
    foreach ($line in $Lines) {
      $writer.WriteLine($line)
    }
  } finally {
    $writer.Dispose()
  }
}

$encryptionKey = $secrets['ENCRYPTION_KEY']
if (-not $encryptionKey) {
  $encryptionKey = Read-Host "Enter ENCRYPTION_KEY (leave blank to generate)"
}
if (-not $encryptionKey) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $encryptionKey = [Convert]::ToBase64String($bytes)
  Write-Host "Generated ENCRYPTION_KEY: $encryptionKey" -ForegroundColor Yellow
}
Set-SecretValue -Key 'ENCRYPTION_KEY' -Value $encryptionKey

$gymToken = $secrets['GYM_APP_TOKEN']
if (-not $gymToken) {
  $gymToken = Read-Host "Enter GYM_APP_TOKEN (optional, press Enter to skip)"
}
if ($gymToken) {
  Set-SecretValue -Key 'GYM_APP_TOKEN' -Value $gymToken
}

# persist secrets locally (ignored by git)
$secretsLines = $secrets.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value }
Write-TextNoBom -Path $secretsPath -Lines $secretsLines

Write-Host "Saved local secrets to $secretsPath" -ForegroundColor Green

# write secrets for local edge runtime BEFORE starting
$localEnvPath = "C:\projects\gym-bot\supabase\.env"
$localEnvLines = @(
  "ENCRYPTION_KEY=$encryptionKey",
  "APP_TIMEZONE=$TimeZone"
)
if ($gymToken) {
  $localEnvLines += "GYM_APP_TOKEN=$gymToken"
}
Write-TextNoBom -Path $localEnvPath -Lines $localEnvLines
Write-Host "Wrote local Edge secrets to $localEnvPath" -ForegroundColor Green

$functionsEnvPath = "C:\projects\gym-bot\supabase\functions\.env"
Write-TextNoBom -Path $functionsEnvPath -Lines $localEnvLines
Write-Host "Wrote local Functions env to $functionsEnvPath" -ForegroundColor Green

Write-Host "Starting Supabase local stack..." -ForegroundColor Cyan
supabase start

if ($LASTEXITCODE -ne 0) {
  Write-Host "Supabase failed to start. Check for leftover containers and rerun." -ForegroundColor Red
  Write-Host "Suggested cleanup:" -ForegroundColor Yellow
  Write-Host "- supabase stop --all" -ForegroundColor Yellow
  Write-Host "- docker ps -a --filter \"name=supabase_\"" -ForegroundColor Yellow
  Write-Host "- docker rm -f supabase_vector_gym-bot (and any other conflicting containers)" -ForegroundColor Yellow
  exit 1
}

Write-Host "\nSupabase status:" -ForegroundColor Cyan
$status = supabase status
if (-not $status) {
  Write-Host "Supabase status not available. Is Docker running?" -ForegroundColor Red
  exit 1
}
$status

$localUrl = $null
$localAnon = $null

try {
  $rawJson = supabase status --output json 2>$null
  if ($rawJson) {
    $statusJson = $rawJson | ConvertFrom-Json
    $localUrl = $statusJson.project_url
    if (-not $localUrl) { $localUrl = $statusJson.api_url }
    if (-not $localUrl) { $localUrl = $statusJson.url }

    $localAnon = $statusJson.publishable_key
    if (-not $localAnon) { $localAnon = $statusJson.anon_key }
  }
} catch {
  # ignore and fall back to text parsing
}

function Extract-StatusValue {
  param(
    [string[]]$Lines,
    [string]$Label
  )
  $bar = "[|\u2502]"  # '|' or box-drawing vertical bar
  $pattern = "^\s*$Label\s*$bar\s*(.+)$"
  foreach ($line in $Lines) {
    $trimmed = $line.Trim()
    $match = [regex]::Match($trimmed, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) {
      return $match.Groups[1].Value.Trim()
    }
    # fallback for formats with ':'
    $patternColon = "^\s*$Label\s*:\s*(.+)$"
    $matchColon = [regex]::Match($trimmed, $patternColon, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($matchColon.Success) {
      return $matchColon.Groups[1].Value.Trim()
    }
  }
  return $null
}

if (-not $localUrl -or -not $localAnon) {
  $lines = $status -split "`n"
  if (-not $localUrl) {
    $localUrl = Extract-StatusValue -Lines $lines -Label "Project URL"
    if (-not $localUrl) { $localUrl = Extract-StatusValue -Lines $lines -Label "API URL" }
  }

  if (-not $localAnon) {
    $localAnon = Extract-StatusValue -Lines $lines -Label "Publishable"
    if (-not $localAnon) { $localAnon = Extract-StatusValue -Lines $lines -Label "anon key" }
    if (-not $localAnon) { $localAnon = Extract-StatusValue -Lines $lines -Label "anon key (JWT)" }
  }
}

# last-resort regex scanning from the raw status output
if (-not $localUrl) {
  $preferredMatch = [regex]::Match($status, "http://127\.0\.0\.1:54321")
  if ($preferredMatch.Success) {
    $localUrl = $preferredMatch.Value
  } else {
    $urlMatch = [regex]::Match($status, "http://127\.0\.0\.1:\d+")
    if ($urlMatch.Success) { $localUrl = $urlMatch.Value }
  }
}
if (-not $localAnon) {
  $anonMatch = [regex]::Match($status, "sb_publishable_[A-Za-z0-9_\-]+")
  if ($anonMatch.Success) { $localAnon = $anonMatch.Value }
}

if (-not $localUrl) {
  $localUrl = Read-Host "Enter local SUPABASE_URL (from supabase status, e.g. http://127.0.0.1:54321)"
}
if (-not $localAnon) {
  $localAnon = Read-Host "Enter local SUPABASE_ANON_KEY"
}

if (-not $localUrl -or -not $localAnon) {
  Write-Host "SUPABASE_URL and SUPABASE_ANON_KEY are required for the frontend." -ForegroundColor Red
  exit 1
}

$envPath = "C:\projects\gym-bot\web\.env.development"
Write-TextNoBom -Path $envPath -Lines @("REACT_APP_SUPABASE_URL=$localUrl","REACT_APP_SUPABASE_ANON_KEY=$localAnon")

Write-Host "Wrote frontend env to $envPath" -ForegroundColor Green

Write-Host "Applying local database schema..." -ForegroundColor Cyan
supabase db reset

Write-Host "Edge Functions are served from the local stack." -ForegroundColor Cyan
Write-Host "\nLocal dev setup complete." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "- In another terminal: cd C:\projects\gym-bot\web && npm start" -ForegroundColor Cyan
Write-Host "- Use Supabase Studio at http://127.0.0.1:54323" -ForegroundColor Cyan
