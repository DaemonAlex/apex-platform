# ============================================================
# APEX Platform Automated Backup
# Backs up: PostgreSQL, MariaDB, configs, and source code
# Destination: H:\My Drive\APEXBU (Google Drive sync)
#
# Usage: powershell -File backup.ps1
#        powershell -File backup.ps1 -DbOnly
# ============================================================

param([switch]$DbOnly)

$ErrorActionPreference = "Continue"
$BackupRoot = "H:\My Drive\APEXBU"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$BackupDir = Join-Path $BackupRoot $Timestamp
$LogFile = Join-Path $BackupRoot "backup.log"

# Create directories
New-Item -ItemType Directory -Force -Path "$BackupDir\databases" | Out-Null
New-Item -ItemType Directory -Force -Path "$BackupDir\configs" | Out-Null
New-Item -ItemType Directory -Force -Path "$BackupDir\source" | Out-Null

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $msg
}

Log "============================================"
Log "Backup started -> $BackupDir"
Log "============================================"

# ============================================================
# 1. PostgreSQL (APEX database)
#
# PGPASSWORD must be set in the environment before running this script.
# Example: $env:PGPASSWORD = "<your-postgres-superuser-password>"
#          .\backup.ps1
#
# Do NOT hardcode the password here - committed to git.
# ============================================================
Write-Host "`n[1/5] PostgreSQL (apex_db)..." -ForegroundColor Cyan
if (-not $env:PGPASSWORD) {
    Write-Host "ERROR: PGPASSWORD environment variable is not set." -ForegroundColor Red
    Write-Host "       Set it before running this script:" -ForegroundColor Red
    Write-Host "       `$env:PGPASSWORD = '<your-password>'" -ForegroundColor Red
    exit 1
}

# Custom format (for pg_restore)
& "C:\Program Files\PostgreSQL\16\bin\pg_dump" -h localhost -U postgres -d apex_db -F c -f "$BackupDir\databases\apex_db.dump" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "      OK - apex_db.dump" -ForegroundColor Green
    Log "PostgreSQL apex_db (custom): SUCCESS"
} else {
    Write-Host "      FAILED" -ForegroundColor Red
    Log "PostgreSQL apex_db (custom): FAILED"
}

# Plain SQL (readable)
& "C:\Program Files\PostgreSQL\16\bin\pg_dump" -h localhost -U postgres -d apex_db --no-owner --no-privileges -f "$BackupDir\databases\apex_db.sql" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "      OK - apex_db.sql (plain)" -ForegroundColor Green
    Log "PostgreSQL apex_db (plain): SUCCESS"
} else {
    Write-Host "      FAILED" -ForegroundColor Red
    Log "PostgreSQL apex_db (plain): FAILED"
}

# ============================================================
# 2. MariaDB (Qbox/FiveM database)
# ============================================================
Write-Host "`n[2/5] MariaDB (Qbox_798C3D)..." -ForegroundColor Cyan
& "C:\Program Files\MariaDB 12.1\bin\mariadb-dump" -h localhost -u root --single-transaction --routines --triggers Qbox_798C3D 2>$null | Out-File -FilePath "$BackupDir\databases\Qbox_798C3D.sql" -Encoding utf8
if ($LASTEXITCODE -eq 0) {
    Write-Host "      OK - Qbox_798C3D.sql" -ForegroundColor Green
    Log "MariaDB Qbox_798C3D: SUCCESS"
} else {
    Write-Host "      FAILED" -ForegroundColor Red
    Log "MariaDB Qbox_798C3D: FAILED"
}

if ($DbOnly) {
    Write-Host "`nDB-only mode, skipping files." -ForegroundColor Yellow
    goto cleanup
}

# ============================================================
# 3. APEX Platform source code
# ============================================================
Write-Host "`n[3/5] APEX source code..." -ForegroundColor Cyan
$excludeDirs = @("node_modules", "uploads", "temp", ".next")

# Node backend (excluding node_modules, uploads, temp, .env)
robocopy "F:\Server\webapps\sites\apex-platform\node" "$BackupDir\source\node" /E /XD node_modules uploads temp /XF .env *.log /NFL /NDL /NJH /NJS /NS /NC /NP | Out-Null

# Vue source
robocopy "F:\Server\webapps\sites\apex-platform\client\src" "$BackupDir\source\client-src" /E /NFL /NDL /NJH /NJS /NS /NC /NP | Out-Null

# Key root files
Copy-Item "F:\Server\webapps\sites\apex-platform\index.html" "$BackupDir\source\" -Force 2>$null
Copy-Item "F:\Server\webapps\sites\apex-platform\package.json" "$BackupDir\source\" -Force 2>$null
Copy-Item "F:\Server\webapps\sites\apex-platform\client\package.json" "$BackupDir\source\client-package.json" -Force 2>$null
Copy-Item "F:\Server\webapps\sites\apex-platform\client\vite.config.ts" "$BackupDir\source\vite.config.ts" -Force 2>$null

# Built bundle
Copy-Item "F:\Server\webapps\sites\apex-platform\vue\apex-rooms.iife.js" "$BackupDir\source\apex-rooms.iife.js" -Force 2>$null
Copy-Item "F:\Server\webapps\sites\apex-platform\vue\apex-rooms.css" "$BackupDir\source\apex-rooms.css" -Force 2>$null

# Scripts
robocopy "F:\Server\webapps\sites\apex-platform\scripts" "$BackupDir\source\scripts" /E /NFL /NDL /NJH /NJS /NS /NC /NP | Out-Null

Write-Host "      OK - source files" -ForegroundColor Green
Log "APEX source code: SUCCESS"

# ============================================================
# 4. Config files
# ============================================================
Write-Host "`n[4/5] Configs..." -ForegroundColor Cyan
Copy-Item "C:\tools\nginx-1.29.3\conf\nginx.conf" "$BackupDir\configs\" -Force 2>$null
robocopy "C:\tools\nginx-1.29.3\conf\sites-enabled" "$BackupDir\configs\nginx-sites" /E /NFL /NDL /NJH /NJS /NS /NC /NP | Out-Null
Copy-Item "C:\Users\Administrator\.cloudflared\config.yml" "$BackupDir\configs\cloudflared-config.yml" -Force 2>$null
Copy-Item "C:\Users\Administrator\CLAUDE.md" "$BackupDir\configs\CLAUDE.md" -Force 2>$null

# .env file (important for recovery but sensitive)
Copy-Item "F:\Server\webapps\sites\apex-platform\node\.env" "$BackupDir\configs\apex.env" -Force 2>$null

# Service startup scripts
Copy-Item "F:\Server\webapps\sites\apex-platform\service-start.bat" "$BackupDir\configs\apex-service-start.bat" -Force 2>$null
Copy-Item "F:\Server\web\dpsrp-portal\service-start.bat" "$BackupDir\configs\dpsrp-service-start.bat" -Force 2>$null

Write-Host "      OK - configs" -ForegroundColor Green
Log "Configs: SUCCESS"

# ============================================================
# 5. DPSRP Portal
# ============================================================
Write-Host "`n[5/5] DPSRP Portal source..." -ForegroundColor Cyan
robocopy "F:\Server\web\dpsrp-portal\src" "$BackupDir\source\dpsrp-portal-src" /E /NFL /NDL /NJH /NJS /NS /NC /NP | Out-Null
robocopy "F:\Server\web\dpsrp-portal\public" "$BackupDir\source\dpsrp-portal-public" /E /NFL /NDL /NJH /NJS /NS /NC /NP | Out-Null
Copy-Item "F:\Server\web\dpsrp-portal\server.js" "$BackupDir\source\dpsrp-server.js" -Force 2>$null
Copy-Item "F:\Server\web\dpsrp-portal\package.json" "$BackupDir\source\dpsrp-package.json" -Force 2>$null
Copy-Item "F:\Server\web\dpsrp-portal\next.config.mjs" "$BackupDir\source\dpsrp-next.config.mjs" -Force 2>$null

Write-Host "      OK - portal files" -ForegroundColor Green
Log "DPSRP Portal: SUCCESS"

# ============================================================
# Cleanup old backups (keep last 7)
# ============================================================
Write-Host "`nCleaning up old backups (keeping last 7)..." -ForegroundColor Yellow
$allBackups = Get-ChildItem -Path $BackupRoot -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}' } | Sort-Object Name -Descending
$count = 0
foreach ($dir in $allBackups) {
    $count++
    if ($count -gt 7) {
        Write-Host "      Removing: $($dir.Name)" -ForegroundColor DarkGray
        Remove-Item $dir.FullName -Recurse -Force 2>$null
        Log "Removed old backup: $($dir.Name)"
    }
}

# ============================================================
# Summary
# ============================================================
$size = (Get-ChildItem -Path $BackupDir -Recurse | Measure-Object -Property Length -Sum).Sum
$sizeMB = [math]::Round($size / 1MB, 1)

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "Backup complete: $BackupDir" -ForegroundColor Green
Write-Host "Size: ${sizeMB} MB" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Log "Backup complete. Size: ${sizeMB} MB"
