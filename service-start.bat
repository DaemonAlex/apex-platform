@echo off
REM APEX Platform Backend Service Start Script
REM This script is run by NSSM Windows Service

cd /d F:\Server\webapps\sites\apex-platform\node

REM Wait for PostgreSQL to be ready
timeout /t 10 /nobreak >nul

REM Start the Node.js backend
node server.js
