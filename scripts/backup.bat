@echo off
REM ============================================================
REM APEX Platform Automated Backup
REM Backs up: PostgreSQL, MariaDB, configs, and source code
REM Destination: H:\My Drive\APEXBU (Google Drive sync)
REM
REM Usage: backup.bat           (runs full backup)
REM        backup.bat db-only   (databases only, faster)
REM ============================================================

setlocal EnableDelayedExpansion

set BACKUP_ROOT=H:\My Drive\APEXBU
set TIMESTAMP=%date:~10,4%-%date:~4,2%-%date:~7,2%_%time:~0,2%-%time:~3,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_DIR=%BACKUP_ROOT%\%TIMESTAMP%
set LOG=%BACKUP_ROOT%\backup.log

REM Create backup directory
mkdir "%BACKUP_DIR%" 2>nul
mkdir "%BACKUP_DIR%\databases" 2>nul
mkdir "%BACKUP_DIR%\configs" 2>nul
mkdir "%BACKUP_DIR%\source" 2>nul

echo ============================================================ >> "%LOG%"
echo [%date% %time%] Backup started >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo.
echo [APEX BACKUP] Starting backup to %BACKUP_DIR%
echo.

REM ============================================================
REM 1. PostgreSQL (APEX database)
REM
REM PGPASSWORD must be set in the environment before running this script.
REM Example: set PGPASSWORD=<your-postgres-superuser-password> & backup.bat
REM
REM Or set it permanently for the user/system via Windows env vars.
REM Do NOT hardcode the password here - committed to git.
REM ============================================================
echo [1/5] Backing up PostgreSQL (apex_db)...
if "%PGPASSWORD%"=="" (
    echo ERROR: PGPASSWORD environment variable is not set.
    echo        Set it before running this script:  set PGPASSWORD=^<your-password^>
    exit /b 1
)
"C:\Program Files\PostgreSQL\16\bin\pg_dump" -h localhost -U postgres -d apex_db -F c -f "%BACKUP_DIR%\databases\apex_db.dump" 2>>"%LOG%"
if %ERRORLEVEL% EQU 0 (
    echo       OK - apex_db.dump
    echo [%date% %time%] PostgreSQL apex_db: SUCCESS >> "%LOG%"
) else (
    echo       FAILED - check log
    echo [%date% %time%] PostgreSQL apex_db: FAILED >> "%LOG%"
)

REM Also dump as plain SQL for readability
"C:\Program Files\PostgreSQL\16\bin\pg_dump" -h localhost -U postgres -d apex_db --no-owner --no-privileges -f "%BACKUP_DIR%\databases\apex_db.sql" 2>>"%LOG%"
if %ERRORLEVEL% EQU 0 (
    echo       OK - apex_db.sql (plain text)
) else (
    echo       FAILED - plain SQL dump
)

REM ============================================================
REM 2. MariaDB (Qbox/FiveM database)
REM ============================================================
echo [2/5] Backing up MariaDB (Qbox_798C3D)...
"C:\Program Files\MariaDB 12.1\bin\mariadb-dump" -h localhost -u root --single-transaction --routines --triggers Qbox_798C3D > "%BACKUP_DIR%\databases\Qbox_798C3D.sql" 2>>"%LOG%"
if %ERRORLEVEL% EQU 0 (
    echo       OK - Qbox_798C3D.sql
    echo [%date% %time%] MariaDB Qbox_798C3D: SUCCESS >> "%LOG%"
) else (
    echo       FAILED - check log
    echo [%date% %time%] MariaDB Qbox_798C3D: FAILED >> "%LOG%"
)

if "%1"=="db-only" goto :cleanup

REM ============================================================
REM 3. APEX Platform source code
REM ============================================================
echo [3/5] Backing up APEX source code...
robocopy "F:\Server\webapps\sites\apex-platform\node" "%BACKUP_DIR%\source\node" /E /XD node_modules uploads temp /XF .env *.log /NFL /NDL /NJH /NJS >nul 2>>"%LOG%"
robocopy "F:\Server\webapps\sites\apex-platform\client\src" "%BACKUP_DIR%\source\client-src" /E /NFL /NDL /NJH /NJS >nul 2>>"%LOG%"
copy "F:\Server\webapps\sites\apex-platform\index.html" "%BACKUP_DIR%\source\" >nul 2>>"%LOG%"
copy "F:\Server\webapps\sites\apex-platform\package.json" "%BACKUP_DIR%\source\" >nul 2>>"%LOG%"
copy "F:\Server\webapps\sites\apex-platform\client\package.json" "%BACKUP_DIR%\source\client-package.json" >nul 2>>"%LOG%"
copy "F:\Server\webapps\sites\apex-platform\client\vite.config.ts" "%BACKUP_DIR%\source\vite.config.ts" >nul 2>>"%LOG%"
echo       OK - source files copied
echo [%date% %time%] Source code: SUCCESS >> "%LOG%"

REM ============================================================
REM 4. Config files
REM ============================================================
echo [4/5] Backing up configs...
copy "C:\tools\nginx-1.29.3\conf\nginx.conf" "%BACKUP_DIR%\configs\" >nul 2>>"%LOG%"
robocopy "C:\tools\nginx-1.29.3\conf\sites-enabled" "%BACKUP_DIR%\configs\nginx-sites" /E /NFL /NDL /NJH /NJS >nul 2>>"%LOG%"
copy "C:\Users\Administrator\.cloudflared\config.yml" "%BACKUP_DIR%\configs\cloudflared-config.yml" >nul 2>>"%LOG%"
copy "C:\Users\Administrator\CLAUDE.md" "%BACKUP_DIR%\configs\CLAUDE.md" >nul 2>>"%LOG%"
echo       OK - configs copied
echo [%date% %time%] Configs: SUCCESS >> "%LOG%"

REM ============================================================
REM 5. DPSRP Portal source
REM ============================================================
echo [5/5] Backing up DPSRP Portal...
robocopy "F:\Server\web\dpsrp-portal" "%BACKUP_DIR%\source\dpsrp-portal" /E /XD node_modules .next /XF .env *.log /NFL /NDL /NJH /NJS >nul 2>>"%LOG%"
echo       OK - portal files copied
echo [%date% %time%] DPSRP Portal: SUCCESS >> "%LOG%"

:cleanup
REM ============================================================
REM Cleanup old backups (keep last 7)
REM ============================================================
echo.
echo Cleaning up old backups (keeping last 7)...
set COUNT=0
for /f "delims=" %%D in ('dir /b /ad /o-d "%BACKUP_ROOT%\20*" 2^>nul') do (
    set /a COUNT+=1
    if !COUNT! GTR 7 (
        echo       Removing old backup: %%D
        rmdir /s /q "%BACKUP_ROOT%\%%D" 2>nul
        echo [%date% %time%] Removed old backup: %%D >> "%LOG%"
    )
)

REM ============================================================
REM Summary
REM ============================================================
echo.
echo ============================================================
echo Backup complete: %BACKUP_DIR%
echo ============================================================

REM Calculate size
for /f "tokens=3" %%S in ('dir /s "%BACKUP_DIR%" 2^>nul ^| findstr "File(s)"') do set SIZE=%%S
echo Size: %SIZE% bytes
echo [%date% %time%] Backup complete. Dir: %BACKUP_DIR% >> "%LOG%"

endlocal
