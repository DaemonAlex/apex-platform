@echo off
REM APEX Platform Backend Service Start Script
REM Called by NSSM Windows Service (APEX-Backend)
REM
REM Behavior: polls pg_isready until PostgreSQL is accepting
REM connections, then starts node server.js. If PostgreSQL does
REM not become ready within 60 seconds, exits non-zero so NSSM
REM can retry the service cleanly instead of crash-looping Node.

cd /d F:\Server\webapps\sites\apex-platform\node

set PG_ISREADY="C:\Program Files\PostgreSQL\16\bin\pg_isready.exe"
set /a ATTEMPT=0
set /a MAX_ATTEMPTS=30

:wait_for_pg
set /a ATTEMPT+=1
%PG_ISREADY% -h localhost -p 5432 -q
if %ERRORLEVEL% EQU 0 (
    echo [%DATE% %TIME%] PostgreSQL ready after %ATTEMPT% attempt^(s^)
    goto start_node
)
if %ATTEMPT% GEQ %MAX_ATTEMPTS% (
    echo [%DATE% %TIME%] FATAL: PostgreSQL not ready after %MAX_ATTEMPTS% attempts ^(60s^). Exiting so NSSM can retry.
    exit /b 1
)
echo [%DATE% %TIME%] Waiting for PostgreSQL... attempt %ATTEMPT%/%MAX_ATTEMPTS%
timeout /t 2 /nobreak >nul
goto wait_for_pg

:start_node
echo [%DATE% %TIME%] Starting Node.js backend: node server.js
node server.js
